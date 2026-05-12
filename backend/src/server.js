import express from "express";
import { failure, MAX_CODE_BYTES, runPython } from "./executor.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN);

app.disable("x-powered-by");

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.sendStatus(origin && !isAllowedOrigin(origin) ? 403 : 204);
    return;
  }

  next();
});

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "coreloop-backend" });
});

app.post("/api/run", async (req, res) => {
  const { code } = req.body ?? {};

  if (typeof code !== "string") {
    res
      .status(400)
      .json(failure('Field "code" is required and must be a string.'));
    return;
  }

  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    res.status(413).json(failure(`Code exceeds the ${MAX_CODE_BYTES}-byte limit.`));
    return;
  }

  const result = await runPython(code);
  res.json(result);
});

app.use((_req, res) => {
  res.status(404).json(failure("Route not found."));
});

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError) {
    res.status(400).json(failure("Request body must be valid JSON."));
    return;
  }

  if (err?.type === "entity.too.large") {
    res.status(413).json(failure(`Code exceeds the ${MAX_CODE_BYTES}-byte limit.`));
    return;
  }

  res.status(500).json(failure(`Internal server failure: ${err.message}`));
});

app.listen(port, () => {
  console.log(`CoreLoop backend listening on http://localhost:${port}`);
});

function parseAllowedOrigins(value) {
  if (!value) {
    return new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
  }

  return new Set(
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function isAllowedOrigin(origin) {
  return allowedOrigins.has("*") || allowedOrigins.has(origin);
}
