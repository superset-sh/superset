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
import { main, resources, version } from "./package.json";

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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Copies a directory from src to dest, cleaning the destination first.
 * No-op if source doesn't exist.
 */
function copyDir({ src, dest }: { src: string; dest: string }): void {
	if (!existsSync(src)) return;

	if (existsSync(dest)) {
		rmSync(dest, { recursive: true });
	}
	mkdirSync(dest, { recursive: true });
	cpSync(src, dest, { recursive: true });
}

/**
 * Stringifies a value for use in Vite's define config.
 */
function defineEnv(value: string | undefined, fallback?: string): string {
	return JSON.stringify(value ?? fallback);
}

// ============================================================================
// Resource Definitions
// ============================================================================

/**
 * Resources to copy to dist folder during build.
 * Each entry specifies a source path and destination path.
 */
const RESOURCES_TO_COPY = [
	// Notification sounds
	{
		src: resolve(resources, "sounds"),
		dest: resolve(devPath, "resources/sounds"),
	},
	// Database migrations from local-db package
	{
		src: resolve(__dirname, "../../packages/local-db/drizzle"),
		dest: resolve(devPath, "resources/migrations"),
	},
	// Agent-setup templates (read at runtime via __dirname)
	{
		src: resolve(__dirname, "src/main/lib/agent-setup/templates"),
		dest: resolve(devPath, "main/templates"),
	},
];

// ============================================================================
// Plugins
// ============================================================================

/**
 * Plugin to copy resources to the dist folder for preview/production mode.
 * In preview mode, __dirname resolves relative to dist/main, so resources
 * need to be copied to dist/ for the main process to access them.
 *
 * Cleans each destination first to avoid stale files from previous builds.
 */
function copyResourcesPlugin(): Plugin {
	return {
		name: "copy-resources",
		writeBundle() {
			for (const resource of RESOURCES_TO_COPY) {
				copyDir(resource);
			}
		},
	};
}

export default defineConfig({
	main: {
		plugins: [tsconfigPaths, copyResourcesPlugin()],

		define: {
			"process.env.NODE_ENV": defineEnv(process.env.NODE_ENV, "production"),
			"process.env.SKIP_ENV_VALIDATION": defineEnv(
				process.env.SKIP_ENV_VALIDATION,
				"",
			),
			// API URLs - baked in at build time for main process
			"process.env.NEXT_PUBLIC_API_URL": defineEnv(
				process.env.NEXT_PUBLIC_API_URL,
				"https://api.superset.sh",
			),
			"process.env.NEXT_PUBLIC_WEB_URL": defineEnv(
				process.env.NEXT_PUBLIC_WEB_URL,
				"https://app.superset.sh",
			),
			// OAuth client IDs - baked in at build time for main process
			"process.env.GOOGLE_CLIENT_ID": defineEnv(process.env.GOOGLE_CLIENT_ID),
			"process.env.GH_CLIENT_ID": defineEnv(process.env.GH_CLIENT_ID),
			"process.env.SENTRY_DSN_DESKTOP": defineEnv(
				process.env.SENTRY_DSN_DESKTOP,
			),
			// PostHog - must match renderer for analytics in main process
			"process.env.NEXT_PUBLIC_POSTHOG_KEY": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_KEY,
			),
			"process.env.NEXT_PUBLIC_POSTHOG_HOST": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_HOST,
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
			"process.env.NODE_ENV": defineEnv(process.env.NODE_ENV, "production"),
			"process.env.SKIP_ENV_VALIDATION": defineEnv(
				process.env.SKIP_ENV_VALIDATION,
				"",
			),
			__APP_VERSION__: defineEnv(version),
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
			"process.env.NODE_ENV": defineEnv(process.env.NODE_ENV),
			"process.env.SKIP_ENV_VALIDATION": defineEnv(
				process.env.SKIP_ENV_VALIDATION,
				"",
			),
			"process.platform": defineEnv(process.platform),
			// API URLs - available in renderer if needed
			"process.env.NEXT_PUBLIC_API_URL": defineEnv(
				process.env.NEXT_PUBLIC_API_URL,
				"https://api.superset.sh",
			),
			"process.env.NEXT_PUBLIC_WEB_URL": defineEnv(
				process.env.NEXT_PUBLIC_WEB_URL,
				"https://app.superset.sh",
			),
			// Custom env vars
			"import.meta.env.DEV_SERVER_PORT": defineEnv(String(DEV_SERVER_PORT)),
			"import.meta.env.NEXT_PUBLIC_POSTHOG_KEY": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_KEY,
			),
			"import.meta.env.NEXT_PUBLIC_POSTHOG_HOST": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_HOST,
			),
			"import.meta.env.SENTRY_DSN_DESKTOP": defineEnv(
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

			// Inject env vars into index.html CSP
			{
				name: "html-env-transform",
				transformIndexHtml(html) {
					return html.replace(
						/%NEXT_PUBLIC_API_URL%/g,
						process.env.NEXT_PUBLIC_API_URL || "https://api.superset.sh",
					);
				},
			},
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
