const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// Bloque 1: recibe { titulo, descripcion, prioridad: "alta" | "media" | "baja" }
// y debe crear el ticket en {ITSM_BASE_URL}/api/now/table/incident.
app.post("/incidents", (req, res) => {
  res.status(501).json({ error: "No implementado" });
});

app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
