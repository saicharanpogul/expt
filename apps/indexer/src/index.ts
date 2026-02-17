import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { webhookApp } from "./webhook";
import { apiApp } from "./api";

const app = new Hono();

// ── Middleware ───────────────────────────────────────────────────
app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:3000", "https://expt.fun"],
    allowMethods: ["GET", "POST"],
  })
);

// ── Health check ────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));

// ── Mount routes ────────────────────────────────────────────────
app.route("/", webhookApp);
app.route("/", apiApp);

// ── Start server ────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "4000");

console.log(`
╔═══════════════════════════════════════╗
║   Expt Indexer — Bun + Hono          ║
║   Port: ${PORT}                          ║
║   Health: http://localhost:${PORT}/health ║
╚═══════════════════════════════════════╝
`);

export default {
  port: PORT,
  fetch: app.fetch,
};
