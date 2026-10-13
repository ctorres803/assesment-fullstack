// Verifica tu avance: ejecuta `npm run verificar` con `npm run mock` y `npm run dev` corriendo.
const fs = require("node:fs");
const path = require("node:path");

const APP = `http://localhost:${process.env.PORT || 3000}`;
const ITSM = process.env.ITSM_BASE_URL || "http://localhost:4000";
const AUTH =
  "Basic " + Buffer.from(`${process.env.ITSM_USER}:${process.env.ITSM_PASSWORD}`).toString("base64");

// Contrato del README: traducción de prioridad y tiempo máximo de respuesta si el ITSM falla.
const PRIORIDADES = { alta: "1", media: "2", baja: "3" };
const LIMITE_MS = 5000;
const MARGEN_MS = 1000;

let fallos = 0;
const ok = (msg) => console.log(`  ✅ ${msg}`);
const mal = (msg, ayuda) => {
  fallos++;
  const detalle = ayuda ? `\n     → ${ayuda}` : "";
  console.log(`  ❌ ${msg}${detalle}`);
};
const info = (msg) => console.log(`  ℹ️  ${msg}`);
const titulo = (t) => console.log(`\n${t}`);

const pedir = (url, opts = {}, ms = 8000) => fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });

const enviarJson = (url, body, ms) =>
  pedir(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, ms);

const crearIncidente = (body, ms) => enviarJson(`${APP}/incidents`, body, ms);

const listarTickets = async () => {
  const res = await pedir(`${ITSM}/api/now/table/incident`, { headers: { Authorization: AUTH } });
  const { result = [] } = await res.json();
  return result;
};

// Modo caos del ITSM simulado: "none", "500", "429" o "slow".
const cambiarCaos = async (mode) => {
  const res = await enviarJson(`${ITSM}/__chaos`, { mode });
  if (!res.ok) throw new Error(`el ITSM simulado no aceptó el modo "${mode}" (${res.status})`);
};
const quitarCaos = () => cambiarCaos("none").catch(() => {});

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

  // Por si una ejecución anterior se interrumpió con el modo caos activo.
  await quitarCaos();

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

    const tickets = await listarTickets();
    if (tickets.some((i) => i.short_description === unico)) ok("El ticket se creó en el ITSM");
    else mal("No se encontró el ticket en el ITSM", "revisa que envíes short_description con el título");
  } catch (e) {
    mal("Error al llamar POST /incidents", e.name === "TimeoutError" ? "no respondió en 8 s" : e.message);
  }
  return true;
}

const describirPrioridad = ({ prioridad, recibida }) =>
  recibida === undefined ? `${prioridad} no creó ticket` : `${prioridad} llegó como "${recibida}"`;

async function probarPrioridades() {
  const marca = Date.now();
  const casos = Object.entries(PRIORIDADES).map(([prioridad, esperada]) => ({
    prioridad,
    esperada,
    titulo: `Verificación prioridad ${prioridad} ${marca}`,
  }));
  const contrato = casos.map((c) => `${c.prioridad} → "${c.esperada}"`).join(", ");

  try {
    await Promise.all(
      casos.map(({ titulo, prioridad }) => crearIncidente({ titulo, descripcion: "Prueba automática", prioridad }))
    );
    const tickets = await listarTickets();
    const erradas = casos
      .map((c) => ({ ...c, recibida: tickets.find((t) => t.short_description === c.titulo)?.priority }))
      .filter((c) => c.recibida !== c.esperada);
    if (erradas.length) mal(`Prioridad mal traducida: ${erradas.map(describirPrioridad).join(", ")}`, contrato);
    else ok(`Prioridad traducida al ITSM (${contrato})`);
  } catch (e) {
    mal("Error al probar las prioridades", e.message);
  }
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

async function probarFalloItsm(modo, caso) {
  try {
    await cambiarCaos(modo);
    const res = await crearIncidente(
      { titulo: `Verificación fallo ${Date.now()}`, descripcion: "Prueba automática", prioridad: "media" },
      LIMITE_MS + MARGEN_MS
    );
    const { json } = await leerJson(res);
    if (res.status >= 500 && json?.error) ok(`Si ${caso} → ${res.status} con { error }`);
    else mal(`Si ${caso} → ${res.status}, se esperaba un código 5xx con { error }`);
  } catch (e) {
    if (e.name === "TimeoutError")
      mal(`Si ${caso}, tu servidor se queda colgado`, `debe responder en un máximo de ${LIMITE_MS / 1000} s`);
    else mal(`Error al probar qué pasa si ${caso}`, e.message);
  } finally {
    await quitarCaos();
  }
}

// El modo caos es global en el ITSM simulado: estos casos van uno tras otro y al final.
async function probarFallosItsm() {
  info("Simulando fallos del ITSM (tarda unos segundos)…");
  await probarFalloItsm("500", "el ITSM responde 500");
  await probarFalloItsm("slow", "el ITSM tarda en responder");
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
  await probarPrioridades();
  await probarDatosInvalidos();
  await probarFallosItsm();
  revisarCredenciales();
}

// HTML sin comentarios más los scripts locales que referencia (<script src="...">).
function leerFrontend() {
  const dir = path.join(__dirname, "public");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const externos = [...html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)]
    .map((m) => path.join(dir, m[1].split(/[?#]/)[0]))
    .filter((ruta) => ruta.startsWith(dir + path.sep) && fs.existsSync(ruta))
    .map((ruta) => fs.readFileSync(ruta, "utf8"));
  return [html, ...externos].join("\n");
}

function bloque2() {
  titulo("Bloque 2: Frontend (public/index.html)");
  const codigo = leerFrontend();
  if (/<form[\s>]/i.test(codigo) || /createElement\(\s*["'`]form/.test(codigo)) ok("Hay un formulario");
  else mal("No se encontró un <form>");
  if (/\bfetch\s*\(/.test(codigo) && codigo.includes("/incidents")) ok("Consume /incidents con fetch");
  else mal("No se encontró una llamada a /incidents con fetch");
  info(`Prueba en el navegador (${APP}): carga, éxito con número de ticket y error`);
}

async function main() {
  console.log("Verificando la prueba técnica…");
  const arriba = await entorno();
  if (arriba) await bloque1();
  else info("Bloque 1 omitido: levanta ambos servidores primero");
  bloque2();
  console.log(fallos ? `\n${fallos} punto(s) pendiente(s).` : "\n¡Todo en orden! 🎉");
  process.exitCode = fallos ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
