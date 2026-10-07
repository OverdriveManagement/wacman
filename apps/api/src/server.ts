import { env } from "./env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { HttpError, runMigrations, ensureBootstrapAdmin, Bridge } from "@wacman/core";
import { resolveUser } from "./auth.js";
import { registerRoutes } from "./routes.js";
import { registerMcp } from "./mcp.js";
import { resolveBridgeUser } from "./bridge/session.js";
import { registerBridgeRoutes } from "./bridge/routes.js";
import { sendNotice } from "./bridge/mail.js";
import { startBridgeScheduler } from "./bridge/scheduler.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = process.env.MIGRATIONS_DIR ?? path.resolve(here, "../../../packages/core/drizzle");

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: "info",
      redact: ["req.headers.cookie", "req.headers.authorization"],
      serializers: {
        // les jetons d'accès éventuellement présents dans l'adresse ne sont jamais journalisés
        req: (r: { method: string; url: string; hostname?: string; ip?: string }) => ({
          method: r.method,
          url: r.url.replace(/wac_[A-Za-z0-9_-]+/g, "wac_***").replace(/\/api\/bridge\/dl\/[^/?]+/, "/api/bridge/dl/***"),
          host: r.hostname,
          remoteAddress: r.ip,
        }),
      },
    },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
    // liens de téléchargement WiBridge : jeton signé dans l'adresse (plus long que les 100 caractères par défaut)
    routerOptions: { maxParamLength: 2048 },
  });
  await app.register(cookie);
  await app.register(cors, {
    // WacMan (assistant) et WiBridge (dépôt de pièces jointes) appellent l'API en direct
    origin: (origin, cb) => cb(null, !origin || env.webOrigins.includes(origin) || env.bridgeOrigins.includes(origin)),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  app.addHook("onRequest", async (req) => {
    // WiBridge : session propre, jamais celle de WacMan (et inversement)
    if (req.url.startsWith("/api/bridge/")) {
      const user = await resolveBridgeUser(req);
      if (user) req.bridgeUser = user;
      return;
    }
    if (req.url.startsWith("/api/") && req.url !== "/api/health") {
      const user = await resolveUser(req);
      if (user) req.user = user;
      // un jeton en lecture seule ne peut rien modifier par l'API REST (le serveur MCP filtre ses outils lui-même)
      if (req.readOnlyToken && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !req.url.startsWith("/api/mcp")) {
        throw new HttpError(403, "Ce jeton d'accès est en lecture seule.");
      }
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.message, details: err.details });
    }
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: e.message });
    req.log.error(err);
    return reply.status(500).send({ error: "Erreur interne. L'incident a été journalisé." });
  });

  // pièces jointes WiBridge : corps binaire (le nom et le type du fichier sont dans les en-têtes)
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: Bridge.BRIDGE_MAX_FILE + 1024 * 1024 }, (_req, body, done) => done(null, body));

  await registerRoutes(app);
  await registerMcp(app);
  await registerBridgeRoutes(app);
  return app;
}

async function main() {
  await runMigrations(migrationsFolder);
  const admin = await ensureBootstrapAdmin(env.bootstrapAdminEmail, env.bootstrapAdminPassword, env.bootstrapAdminName);
  const app = await buildApp();
  if (admin) app.log.info(`Super-administrateur initial créé : ${admin.email}`);
  // WiBridge : notifications d'attribution par e-mail et récapitulatif quotidien
  Bridge.setBridgeNotifier(sendNotice);
  startBridgeScheduler((m) => app.log.info(m));
  await app.listen({ port: env.port, host: "0.0.0.0" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
