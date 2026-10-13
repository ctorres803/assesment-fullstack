// ITSM simulado que imita la Table API de ServiceNow.
const express = require("express");

const PORT = 4000;
const USER = process.env.ITSM_USER || "api_user";
const PASSWORD = process.env.ITSM_PASSWORD || "api_pass";

const app = express();
app.use(express.json());

const incidents = [];
let counter = 1000;
let chaosMode = "none";

const failure = (res, status, message) =>
  res.status(status).json({ status: "failure", error: { message } });

const newSysId = () =>
  Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

// Control del evaluador (no documentado)
app.post("/__chaos", (req, res) => {
  const mode = req.body && req.body.mode;
  if (!["none", "500", "429", "slow"].includes(mode)) {
    return res.status(400).json({ error: "mode inválido" });
  }
  chaosMode = mode;
  res.json({ mode: chaosMode });
});

// Caos para todas las rutas /api
app.use("/api", (req, res, next) => {
  if (chaosMode === "500") return failure(res, 500, "Internal Server Error");
  if (chaosMode === "429") {
    res.set("Retry-After", "2");
    return failure(res, 429, "Too Many Requests");
  }
  if (chaosMode === "slow") return setTimeout(next, 15000);
  next();
});

// Autenticación Basic
app.use("/api", (req, res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString();
    const i = decoded.indexOf(":");
    if (i >= 0 && decoded.slice(0, i) === USER && decoded.slice(i + 1) === PASSWORD) {
      return next();
    }
  }
  res.set("WWW-Authenticate", 'Basic realm="ITSM"');
  failure(res, 401, "User Not Authenticated");
});

app.post("/api/now/table/incident", (req, res) => {
  const { short_description, description = "", priority = "3" } = req.body || {};
  if (typeof short_description !== "string" || !short_description.trim()) {
    return failure(res, 400, "short_description es obligatorio");
  }
  if (!["1", "2", "3"].includes(String(priority))) {
    return failure(res, 400, 'priority debe ser "1", "2" o "3"');
  }
  counter += 1;
  const incident = {
    sys_id: newSysId(),
    number: "INC" + String(counter).padStart(7, "0"),
    short_description: short_description.trim(),
    description: String(description),
    priority: String(priority),
    state: "1",
    opened_at: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
  incidents.push(incident);
  res.status(201).json({ result: incident });
});

app.get("/api/now/table/incident", (req, res) => {
  res.json({ result: incidents });
});

app.get("/api/now/table/incident/:sys_id", (req, res) => {
  const found = incidents.find((i) => i.sys_id === req.params.sys_id);
  if (!found) return failure(res, 404, "No Record found");
  res.json({ result: found });
});

app.listen(PORT, () => console.log(`ITSM simulado en http://localhost:${PORT}`));
