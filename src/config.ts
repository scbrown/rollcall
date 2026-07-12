/**
 * Central runtime configuration, read once from the environment.
 *
 * Anything that varies between local dev, homelab, and Fly/Railway lives here
 * so the rest of the code never touches `process.env` directly.
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function intOption(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${raw}"`);
  }
  return parsed;
}

export const DRY_RUN = optional("DRY_RUN", "false").toLowerCase() === "true";

export const config = {
  port: intOption("PORT", 8080),
  databasePath: optional("DATABASE_PATH", "./data/rollcall.db"),

  dryRun: DRY_RUN,

  // Twilio credentials are only strictly required when not in dry-run mode;
  // in dry-run we still read them if present but tolerate placeholders.
  twilio: {
    accountSid: DRY_RUN ? optional("TWILIO_ACCOUNT_SID", "") : required("TWILIO_ACCOUNT_SID"),
    authToken: DRY_RUN ? optional("TWILIO_AUTH_TOKEN", "") : required("TWILIO_AUTH_TOKEN"),
    fromNumber: DRY_RUN ? optional("TWILIO_FROM_NUMBER", "") : required("TWILIO_FROM_NUMBER"),
    webhookUrl: DRY_RUN ? optional("PUBLIC_WEBHOOK_URL", "") : required("PUBLIC_WEBHOOK_URL"),
  },

  defaultExpiryHours: intOption("DEFAULT_EXPIRY_HOURS", 3),
  sweepIntervalSeconds: intOption("SWEEP_INTERVAL_SECONDS", 60),
  logRetentionDays: intOption("LOG_RETENTION_DAYS", 30),

  // Admin web interface. If password is empty the panel refuses to serve.
  admin: {
    password: optional("ADMIN_PASSWORD", ""),
    // Signs session cookies. If empty, a random secret is generated per boot
    // (sessions won't survive a restart — fine for a single-admin tool).
    sessionSecret: optional("ADMIN_SESSION_SECRET", ""),
    sessionHours: intOption("ADMIN_SESSION_HOURS", 24),
  },
} as const;

export type Config = typeof config;
