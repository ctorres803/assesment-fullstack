// Bloque 3: esta función de integración tiene errores.
// Encuéntralos y explica cómo corregirlos.

async function crearTicket(data) {
  const res = await fetch("https://itsm.empresa.com/api/tickets", {
    method: "POST",
    headers: { Authorization: "Basic admin:Password123" },
    body: data,
  });
  const json = await res.json();
  return json.result.number;
}
