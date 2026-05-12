import cors from "cors";
import express from "express";
import { failure, MAX_CODE_BYTES, runPython } from "./executor.js";

const app = express();
const port = Number(process.env.PORT || 3001);

app.disable("x-powered-by");

app.use(
  cors({
    origin: ["https://core-loop.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST"],
  }),
);

app.use(express.json({ limit: "1mb" }));

function health(_req, res) {
  res.json({ ok: true, service: "coreloop-backend" });
}

app.get("/", health);
app.get("/healthz", health);

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

  console.error("[coreloop] unhandled request error:", err);
  res.status(500).json(failure("Internal server error."));
});

const server = app.listen(port, () => {
  console.log(`CoreLoop backend listening on http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`[coreloop] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  // Hard exit if connections do not drain within 10 seconds.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  console.error("[coreloop] uncaughtException:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[coreloop] unhandledRejection:", reason);
  process.exit(1);
});
