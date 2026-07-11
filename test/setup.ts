// Runs before any src module is imported, so config.ts sees these values.
process.env.DRY_RUN = "true";
process.env.DATABASE_PATH = ":memory:";
process.env.DEFAULT_EXPIRY_HOURS = "3";
