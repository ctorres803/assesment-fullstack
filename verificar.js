// Verifica tu avance: ejecuta `npm run verificar` con `npm run mock` y `npm run dev` corriendo.
const fs = require("node:fs");
const path = require("node:path");

const APP = `http://localhost:${process.env.PORT || 3000}`;
const ITSM = process.env.ITSM_BASE_URL || "http://localhost:4000";
const AUTH =
  "Basic " + Buffer.from(`${process.env.ITSM_USER}:${process.env.ITSM_PASSWORD}`).toString("base64");

let fallos = 0;
const ok = (msg) => console.log(`  ✅ ${msg}`);
const mal = (msg, ayuda) => {
  fallos++;
  const detalle = ayuda ? `\n     → ${ayuda}` : "";
  console.log(`  ❌ ${msg}${detalle}`);
};
const info = (msg) => console.log(`  ℹ️  ${msg}`);
const titulo = (t) => console.log(`\n${t}`);

const pedir = (url, opts = {}) => fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });

const crearIncidente = (body) =>
  pedir(`${APP}/incidents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const leerJson = async (res) => {
  const texto = await res.text();
  try {
    return { texto, json: JSON.parse(texto) };
  } catch {
    return { texto, json: null };
  }
};

async function entorno() {
  titulo("Entorno");
  const faltan = ["PORT", "ITSM_BASE_URL", "ITSM_USER", "ITSM_PASSWORD"].filter((k) => !process.env[k]);
  if (faltan.length) mal(`Faltan variables en .env: ${faltan.join(", ")}`, "copia .env.example a .env");
  else ok("Variables de .env cargadas");

  let itsmArriba = false;
  try {
    const res = await pedir(`${ITSM}/api/now/table/incident`, { headers: { Authorization: AUTH } });
    if (res.ok) {
      ok(`ITSM simulado responde en ${ITSM}`);
      itsmArriba = true;
    } else mal(`ITSM simulado respondió ${res.status}`, "revisa las credenciales en .env");
  } catch {
    mal(`ITSM simulado no responde en ${ITSM}`, "ejecuta `npm run mock` en otra terminal");
  }

  let appArriba = false;
  try {
    const res = await pedir(`${APP}/`);
    if (res.ok) {
      ok(`Tu servidor responde en ${APP}`);
      appArriba = true;
    } else mal(`Tu servidor respondió ${res.status} en /`);
  } catch {
    mal(`Tu servidor no responde en ${APP}`, "ejecuta `npm run dev` en otra terminal");
  }
  return itsmArriba && appArriba;
}

// Devuelve false si el endpoint aún no está implementado (501).
async function probarDatosValidos() {
  const unico = `Verificación ${Date.now()}`;

  try {
    const res = await crearIncidente({ titulo: unico, descripcion: "Prueba automática", prioridad: "media" });
    const { texto } = await leerJson(res);
    if (res.status === 501) {
      mal("POST /incidents todavía responde 501 (No implementado)");
      return false;
    }
    if (res.status >= 200 && res.status < 300) ok(`Datos válidos → ${res.status}`);
    else mal(`Datos válidos → ${res.status}, se esperaba un código 2xx`, texto.slice(0, 200));

    if (/INC\d{7}/.test(texto)) ok("La respuesta incluye el número de ticket (INC…)");
    else mal("La respuesta no incluye el número de ticket (INC…)", "el frontend lo necesita para mostrarlo");

    const lista = await pedir(`${ITSM}/api/now/table/incident`, { headers: { Authorization: AUTH } });
    const { result = [] } = await lista.json();
    if (result.some((i) => i.short_description === unico)) ok("El ticket se creó en el ITSM");
    else mal("No se encontró el ticket en el ITSM", "revisa que envíes short_description con el título");
  } catch (e) {
    mal("Error al llamar POST /incidents", e.name === "TimeoutError" ? "no respondió en 8 s" : e.message);
  }
  return true;
}

const probarInvalido = async ({ caso, body }) => {
  try {
    const res = await crearIncidente(body);
    const { json } = await leerJson(res);
    return { caso, status: res.status, conError: Boolean(json?.error) };
  } catch (e) {
    return { caso, excepcion: e.message };
  }
};

async function probarDatosInvalidos() {
  const invalidos = [
    { caso: "sin título", body: { descripcion: "x", prioridad: "alta" } },
    { caso: "prioridad inválida", body: { titulo: "x", descripcion: "x", prioridad: "urgente" } },
  ];
  const resultados = await Promise.all(invalidos.map(probarInvalido));
  for (const { caso, status, conError, excepcion } of resultados) {
    if (excepcion !== undefined) mal(`Error al probar datos inválidos (${caso})`, excepcion);
    else if (status === 400 && conError) ok(`Datos inválidos (${caso}) → 400 con { error }`);
    else mal(`Datos inválidos (${caso}) → ${status}, se esperaba 400 con { error }`);
  }
}

function revisarCredenciales() {
  const codigo = fs.readFileSync(path.join(__dirname, "src", "server.js"), "utf8");
  const credenciales = [process.env.ITSM_USER, process.env.ITSM_PASSWORD].filter(Boolean);
  if (credenciales.some((c) => codigo.includes(c)))
    mal("Hay credenciales escritas en src/server.js", "léelas desde process.env");
  else ok("Sin credenciales escritas en el código");
}

async function bloque1() {
  titulo("Bloque 1: Backend (POST /incidents)");
  if (!(await probarDatosValidos())) return;
  await probarDatosInvalidos();
  revisarCredenciales();
}

function bloque2() {
  titulo("Bloque 2: Frontend (public/index.html)");
  const html = fs
    .readFileSync(path.join(__dirname, "public", "index.html"), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "");
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  if (/<form[\s>]/i.test(html) || /createElement\(\s*["'`]form/.test(scripts)) ok("Hay un formulario");
  else mal("No se encontró un <form>");
  if (/fetch\([^)]*\/incidents/.test(scripts)) ok("Consume /incidents con fetch");
  else mal("No se encontró una llamada a /incidents");
  info(`Prueba en el navegador (${APP}): carga, éxito con número de ticket y error`);
}

function bloque3() {
  titulo("Bloque 3: Depuración");
  info("Se revisa en conversación con el evaluador");
}

async function main() {
  console.log("Verificando la prueba técnica…");
  const arriba = await entorno();
  if (arriba) await bloque1();
  else info("Bloque 1 omitido: levanta ambos servidores primero");
  bloque2();
  bloque3();
  console.log(fallos ? `\n${fallos} punto(s) pendiente(s).` : "\n¡Todo en orden! 🎉");
  process.exitCode = fallos ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
