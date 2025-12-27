import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import reactPlugin from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import { config } from "dotenv";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import injectProcessEnvPlugin from "rollup-plugin-inject-process-env";
import type { Plugin } from "vite";
import tsconfigPathsPlugin from "vite-tsconfig-paths";
import { main, resources } from "./package.json";

// Dev server port - must match PORTS.VITE_DEV_SERVER in src/shared/constants.ts
const DEV_SERVER_PORT = 5927;

// Load .env from monorepo root
// Use override: true to ensure .env values take precedence over inherited env vars
config({ path: resolve(__dirname, "../../.env"), override: true });

// Extract base output directory (dist/) from main path
const devPath = normalize(dirname(main)).split(/\/|\\/g)[0];

const tsconfigPaths = tsconfigPathsPlugin({
	projects: [resolve("tsconfig.json")],
});

/**
 * Plugin to copy resources (like sounds) to the dist folder for preview mode.
 * In preview mode, __dirname resolves relative to dist/main, so resources
 * need to be at dist/resources/sounds for the main process to access them.
 *
 * Cleans the destination first to avoid stale files from previous builds.
 */
function copyResourcesPlugin(): Plugin {
	return {
		name: "copy-resources",
		writeBundle() {
			// Copy sounds
			const soundsSrc = resolve(resources, "sounds");
			const soundsDest = resolve(devPath, "resources/sounds");

			if (existsSync(soundsSrc)) {
				if (existsSync(soundsDest)) {
					rmSync(soundsDest, { recursive: true });
				}
				mkdirSync(soundsDest, { recursive: true });
				cpSync(soundsSrc, soundsDest, { recursive: true });
			}

			// Copy database migrations from local-db package
			const migrationsSrc = resolve(
				__dirname,
				"../../packages/local-db/drizzle",
			);
			const migrationsDest = resolve(devPath, "resources/migrations");

			if (existsSync(migrationsSrc)) {
				if (existsSync(migrationsDest)) {
					rmSync(migrationsDest, { recursive: true });
				}
				mkdirSync(migrationsDest, { recursive: true });
				cpSync(migrationsSrc, migrationsDest, { recursive: true });
			}
		},
	};
}

export default defineConfig({
	main: {
		plugins: [tsconfigPaths, copyResourcesPlugin()],

		define: {
			"process.env.NODE_ENV": JSON.stringify(
				process.env.NODE_ENV || "production",
			),
			"process.env.SKIP_ENV_VALIDATION": JSON.stringify(
				process.env.SKIP_ENV_VALIDATION || "",
			),
			// API URLs - baked in at build time for main process
			"process.env.NEXT_PUBLIC_API_URL": JSON.stringify(
				process.env.NEXT_PUBLIC_API_URL || "https://api.superset.sh",
			),
			"process.env.NEXT_PUBLIC_WEB_URL": JSON.stringify(
				process.env.NEXT_PUBLIC_WEB_URL || "https://app.superset.sh",
			),
			// OAuth client IDs - baked in at build time for main process
			"process.env.GOOGLE_CLIENT_ID": JSON.stringify(
				process.env.GOOGLE_CLIENT_ID,
			),
			"process.env.GH_CLIENT_ID": JSON.stringify(process.env.GH_CLIENT_ID),
			"process.env.SENTRY_DSN_DESKTOP": JSON.stringify(
				process.env.SENTRY_DSN_DESKTOP,
			),
		},

		build: {
			rollupOptions: {
				input: {
					index: resolve("src/main/index.ts"),
				},
				output: {
					dir: resolve(devPath, "main"),
				},
				// Only externalize native modules that can't be bundled
				external: [
					"electron",
					"better-sqlite3", // Native module - must stay external
					"node-pty", // Native module - must stay external
					/^@sentry\/electron/,
				],
			},
		},
		resolve: {
			alias: {},
		},
	},

	preload: {
		plugins: [
			tsconfigPaths,
			externalizeDepsPlugin({
				exclude: ["trpc-electron"],
			}),
		],

		define: {
			"process.env.NODE_ENV": JSON.stringify(
				process.env.NODE_ENV || "production",
			),
			"process.env.SKIP_ENV_VALIDATION": JSON.stringify(
				process.env.SKIP_ENV_VALIDATION || "",
			),
		},

		build: {
			outDir: resolve(devPath, "preload"),
			rollupOptions: {
				input: {
					index: resolve("src/preload/index.ts"),
				},
			},
		},
	},

	renderer: {
		define: {
			// Core env vars - Vite replaces these at build time
			"process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
			"process.env.SKIP_ENV_VALIDATION": JSON.stringify(
				process.env.SKIP_ENV_VALIDATION || "",
			),
			"process.platform": JSON.stringify(process.platform),
			// API URLs - available in renderer if needed
			"process.env.NEXT_PUBLIC_API_URL": JSON.stringify(
				process.env.NEXT_PUBLIC_API_URL || "https://api.superset.sh",
			),
			"process.env.NEXT_PUBLIC_WEB_URL": JSON.stringify(
				process.env.NEXT_PUBLIC_WEB_URL || "https://app.superset.sh",
			),
			// Custom env vars
			"import.meta.env.DEV_SERVER_PORT": JSON.stringify(DEV_SERVER_PORT),
			"import.meta.env.NEXT_PUBLIC_POSTHOG_KEY": JSON.stringify(
				process.env.NEXT_PUBLIC_POSTHOG_KEY,
			),
			"import.meta.env.NEXT_PUBLIC_POSTHOG_HOST": JSON.stringify(
				process.env.NEXT_PUBLIC_POSTHOG_HOST,
			),
			"import.meta.env.SENTRY_DSN_DESKTOP": JSON.stringify(
				process.env.SENTRY_DSN_DESKTOP,
			),
		},

		server: {
			port: DEV_SERVER_PORT,
			strictPort: false, // Allow fallback to next available port
		},

		plugins: [
			tsconfigPaths,
			tailwindcss(),
			reactPlugin(),

			codeInspectorPlugin({
				bundler: "vite",
				hotKeys: ["altKey"],
				hideConsole: true,
			}),
		],

		// Monaco editor worker configuration
		worker: {
			format: "es",
		},

		optimizeDeps: {
			include: ["monaco-editor"],
		},

		publicDir: resolve(resources, "public"),

		build: {
			outDir: resolve(devPath, "renderer"),

			rollupOptions: {
				plugins: [
					injectProcessEnvPlugin({
						NODE_ENV: "production",
						platform: process.platform,
					}),
				],

				input: {
					index: resolve("src/renderer/index.html"),
				},

				// Externalize Sentry - it uses IPC to communicate with main process
				external: [/^@sentry\/electron/],
			},
		},
	},
});
