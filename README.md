# Prueba técnica Full Stack: integración ITSM

Duración total: **30 minutos**. Puedes consultar documentación; **piensa en voz alta** mientras trabajas.

## Cómo arrancar

**GitHub Codespaces:** abre el repo en un Codespace. Las dependencias y el archivo `.env` se preparan solos.

**Local (Node 20+):**

```bash
cp .env.example .env
npm install
```

Luego usa dos terminales:

```bash
npm run mock   # terminal 1: ITSM simulado en http://localhost:4000
npm run dev    # terminal 2: tu aplicación en http://localhost:3000
```

Las credenciales y URLs están en `.env`. **No las escribas en el código**: léelas desde `process.env`.

## Contrato del ITSM simulado

Imita la Table API de ServiceNow.

- **Endpoint:** `POST {ITSM_BASE_URL}/api/now/table/incident`
- **Auth:** Basic con `ITSM_USER` e `ITSM_PASSWORD`
- **Body (JSON):**
  - `short_description` (obligatorio)
  - `description` (opcional)
  - `priority`: `"1"`, `"2"` o `"3"`
- Datos inválidos → `400`; credenciales incorrectas → `401`.

Respuesta `201`:

```json
{
  "result": {
    "sys_id": "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    "number": "INC0001001",
    "short_description": "No funciona la VPN",
    "description": "Desde ayer no conecta",
    "priority": "2",
    "state": "1",
    "opened_at": "2026-01-15 10:30:00"
  }
}
```

También existen `GET /api/now/table/incident` (lista) y `GET /api/now/table/incident/:sys_id` (detalle).

## Bloques

1. **Backend (12 min):** implementa `POST /incidents` en `src/server.js`.
   - Recibe `{ titulo, descripcion, prioridad: "alta" | "media" | "baja" }` y crea el ticket en el ITSM.
   - Si los datos son inválidos, responde `400` con `{ error }`.
   - Considera que el ITSM puede fallar o tardar en responder: responde con un error claro en lugar de quedarte colgado.
2. **Frontend (8 min):** en `public/index.html`, un formulario que consuma el endpoint y muestre carga, éxito (con número de ticket) y error.
3. **Depuración (5 min):** revisa `bloque3-depuracion.js`, encuentra los errores y explica cómo corregirlos.
4. **Preguntas (5 min):** conversación con el evaluador.

## Reglas

- Usa `fetch` nativo de Node 20; no instales dependencias adicionales.
- No necesitas hacer commit ni push: trabajarás compartiendo pantalla.

## Verificar tu avance

Con `npm run mock` y `npm run dev` corriendo, abre una tercera terminal y ejecuta:

```bash
npm run verificar
```

Revisa cada paso y te indica qué falta. Puedes ejecutarlo las veces que quieras.
