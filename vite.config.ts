import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	optimizeDeps: {
		exclude: ["hono", "hono/cors"],
	},
	plugins: [react(), cloudflare({ remoteBindings: false })],
	environments: {
		client: {
			build: {
				// The public site (squishman.com) lives in public/ and is copied
				// as-is. The React surface explorer is served from /explorer.
				rollupOptions: { input: { explorer: "explorer.html" } },
			},
		},
	},
});
