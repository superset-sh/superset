import { resolve } from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import reactPlugin from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import { config } from "dotenv";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import injectProcessEnvPlugin from "rollup-plugin-inject-process-env";
import tsconfigPathsPlugin from "vite-tsconfig-paths";

import { resources, version } from "./package.json";
import {
	copyResourcesPlugin,
	DEV_SERVER_PORT,
	defineEnv,
	devPath,
	htmlEnvTransformPlugin,
} from "./vite/helpers";

// override: true ensures .env values take precedence over inherited env vars
config({ path: resolve(__dirname, "../../.env"), override: true, quiet: true });

const tsconfigPaths = tsconfigPathsPlugin({
	projects: [resolve("tsconfig.json")],
});

// Sentry plugin for uploading sourcemaps (only in CI with auth token)
const sentryPlugin = process.env.SENTRY_AUTH_TOKEN
	? sentryVitePlugin({
			org: "superset-sh",
			project: "desktop",
			authToken: process.env.SENTRY_AUTH_TOKEN,
			release: { name: version },
		})
	: null;

export default defineConfig({
	main: {
		plugins: [tsconfigPaths, copyResourcesPlugin()],

		define: {
			"process.env.NODE_ENV": defineEnv(process.env.NODE_ENV, "production"),
			"process.env.SKIP_ENV_VALIDATION": defineEnv(
				process.env.SKIP_ENV_VALIDATION,
				"",
			),
			"process.env.NEXT_PUBLIC_API_URL": defineEnv(
				process.env.NEXT_PUBLIC_API_URL,
				"https://api.superset.sh",
			),
			"process.env.NEXT_PUBLIC_WEB_URL": defineEnv(
				process.env.NEXT_PUBLIC_WEB_URL,
				"https://app.superset.sh",
			),
			"process.env.NEXT_PUBLIC_DOCS_URL": defineEnv(
				process.env.NEXT_PUBLIC_DOCS_URL,
				"https://docs.superset.sh",
			),
			"process.env.GOOGLE_CLIENT_ID": defineEnv(process.env.GOOGLE_CLIENT_ID),
			"process.env.GH_CLIENT_ID": defineEnv(process.env.GH_CLIENT_ID),
			"process.env.SENTRY_DSN_DESKTOP": defineEnv(
				process.env.SENTRY_DSN_DESKTOP,
			),
			// Must match renderer for analytics in main process
			"process.env.NEXT_PUBLIC_POSTHOG_KEY": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_KEY,
			),
			"process.env.NEXT_PUBLIC_POSTHOG_HOST": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_HOST,
			),
		},

		build: {
			sourcemap: true,
			rollupOptions: {
				input: {
					index: resolve("src/main/index.ts"),
					// Terminal host daemon process - runs separately for terminal persistence
					"terminal-host": resolve("src/main/terminal-host/index.ts"),
					// PTY subprocess - spawned by terminal-host for each terminal
					"pty-subprocess": resolve("src/main/terminal-host/pty-subprocess.ts"),
				},
				output: {
					dir: resolve(devPath, "main"),
				},
				external: ["electron", "better-sqlite3", "node-pty"],
				plugins: [sentryPlugin].filter(Boolean),
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
				exclude: ["trpc-electron", "@sentry/electron"],
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
			"process.env.NODE_ENV": defineEnv(process.env.NODE_ENV),
			"process.env.SKIP_ENV_VALIDATION": defineEnv(
				process.env.SKIP_ENV_VALIDATION,
				"",
			),
			"process.platform": defineEnv(process.platform),
			"process.env.NEXT_PUBLIC_API_URL": defineEnv(
				process.env.NEXT_PUBLIC_API_URL,
				"https://api.superset.sh",
			),
			"process.env.NEXT_PUBLIC_WEB_URL": defineEnv(
				process.env.NEXT_PUBLIC_WEB_URL,
				"https://app.superset.sh",
			),
			"process.env.NEXT_PUBLIC_DOCS_URL": defineEnv(
				process.env.NEXT_PUBLIC_DOCS_URL,
				"https://docs.superset.sh",
			),
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
			strictPort: false,
		},

		plugins: [
			tanstackRouter({
				target: "react",
				routesDirectory: resolve("src/renderer/routes"),
				generatedRouteTree: resolve("src/renderer/routeTree.gen.ts"),
				indexToken: "page",
				routeToken: "layout",
				autoCodeSplitting: true,
			}),
			tsconfigPaths,
			tailwindcss(),
			reactPlugin(),
			codeInspectorPlugin({
				bundler: "vite",
				hotKeys: ["altKey"],
				hideConsole: true,
			}),
			htmlEnvTransformPlugin(),
		],

		worker: {
			format: "es",
		},

		optimizeDeps: {
			include: ["monaco-editor"],
		},

		publicDir: resolve(resources, "public"),

		build: {
			sourcemap: true,
			outDir: resolve(devPath, "renderer"),

			rollupOptions: {
				plugins: [
					injectProcessEnvPlugin({
						NODE_ENV: "production",
						platform: process.platform,
					}),
					sentryPlugin,
				].filter(Boolean),

				input: {
					index: resolve("src/renderer/index.html"),
				},
			},
		},
	},
});
