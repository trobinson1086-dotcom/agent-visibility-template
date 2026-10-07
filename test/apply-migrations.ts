import { applyD1Migrations, env } from "cloudflare:test";

// Runs before each test file; isolated storage rolls back to this state.
await applyD1Migrations(env.ORDERS_DB!, env.TEST_MIGRATIONS);
