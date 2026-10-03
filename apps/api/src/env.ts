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
};
process.env.DATABASE_URL = env.databaseUrl;
