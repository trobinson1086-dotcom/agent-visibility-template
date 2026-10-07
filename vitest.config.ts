import path from "node:path";
import {
	defineWorkersProject,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject(async () => {
	// Apply the real D1 migrations to the test database (test/apply-migrations.ts).
	const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
	return {
		test: {
			testTimeout: 60000,
			setupFiles: ["./test/apply-migrations.ts"],
			poolOptions: {
				workers: {
					singleWorker: true,
					remoteBindings: false,
					wrangler: {
						configPath: "./wrangler.jsonc",
					},
					miniflare: {
						// Provide the admin secret for the mutating-route tests.
						bindings: { ADMIN_TOKEN: "test-token", TEST_MIGRATIONS: migrations },
						// Fulfillment order records (no real database in tests).
						d1Databases: ["ORDERS_DB"],
					},
				},
			},
		},
	};
});
