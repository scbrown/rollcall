// Runs before any src module is imported, so config.ts sees these values.
process.env.DRY_RUN = "true";
process.env.DATABASE_PATH = ":memory:";
process.env.DEFAULT_EXPIRY_HOURS = "3";
process.env.ADMIN_PASSWORD = "test-admin-pw";
process.env.ADMIN_SESSION_SECRET = "test-session-secret";
