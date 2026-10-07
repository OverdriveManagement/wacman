/** Variables d'environnement de l'API (voir docs/EXPLOITATION.md). */
const isProd = process.env.NODE_ENV === "production";

function required(name: string, devDefault?: string): string {
  const v = process.env[name];
  if (v) return v;
  if (!isProd && devDefault !== undefined) return devDefault;
  throw new Error(`Variable d'environnement manquante : ${name}`);
}

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", "postgres://wacman:wacman@localhost:5432/wacman"),
  sessionSecret: required("SESSION_SECRET", "dev-session-secret-change-me-dev-session-secret"),
  // origines autorisées à appeler l'API directement (assistant), séparées par des virgules
  webOrigins: (process.env.WEB_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  mailFrom: process.env.MAIL_FROM ?? "WacMan <onboarding@resend.dev>",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL,
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  bootstrapAdminName: process.env.BOOTSTRAP_ADMIN_NAME ?? "Florent Jolivet",
  // en développement uniquement : le code de double authentification est renvoyé dans la réponse
  devShowOtp: !isProd && process.env.DEV_SHOW_OTP !== "0",
  // WiBridge : adresse publique de l'interface (liens des e-mails, appels directs pour les pièces jointes) et expéditeur
  bridgeWebUrl: bridgeUrl(),
  bridgeOrigins: (process.env.BRIDGE_WEB_ORIGINS ?? new URL(bridgeUrl()).origin)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  bridgeMailFrom: process.env.BRIDGE_MAIL_FROM ?? bridgeSender(),
};

function bridgeUrl() {
  return (process.env.BRIDGE_WEB_URL ?? (isProd ? "https://wibridge-wifirst.vercel.app" : "http://localhost:3001")).replace(/\/+$/, "");
}

/** Expéditeur WiBridge : wibridge@ sur le domaine d'envoi de WacMan s'il est vérifié (MAIL_FROM), sinon l'adresse de test Resend. */
function bridgeSender() {
  const m = /@([A-Za-z0-9.-]+)>?\s*$/.exec(process.env.MAIL_FROM ?? "");
  return m && m[1] !== "resend.dev" ? `WiBridge <wibridge@${m[1]}>` : "WiBridge <onboarding@resend.dev>";
}
process.env.DATABASE_URL = env.databaseUrl;
