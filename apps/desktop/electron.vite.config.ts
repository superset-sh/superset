import { dirname, normalize, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import reactPlugin from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import { config } from "dotenv";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import injectProcessEnvPlugin from "rollup-plugin-inject-process-env";
import tsconfigPathsPlugin from "vite-tsconfig-paths";
import { main, resources } from "./package.json";
import { getPortSync } from "./src/main/lib/port-manager";

// Load .env from monorepo root
// Use override: true to ensure .env values take precedence over inherited env vars
config({ path: resolve(__dirname, "../../.env"), override: true });

// Extract base output directory (dist/) from main path
const devPath = normalize(dirname(main)).split(/\/|\\/g)[0];

const tsconfigPaths = tsconfigPathsPlugin({
	projects: [resolve("tsconfig.json")],
});

export default defineConfig({
	main: {
		plugins: [
			tsconfigPaths,
			externalizeDepsPlugin({
				exclude: ["@superset/*", "electron-store"],
			}),
		],

		build: {
			rollupOptions: {
				input: {
					index: resolve("src/main/index.ts"),
				},

				output: {
					dir: resolve(devPath, "main"),
				},
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
			"process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
			"process.platform": JSON.stringify(process.platform),
			"import.meta.env.ENABLE_NEW_UI": JSON.stringify(
				process.env.ENABLE_NEW_UI || "false",
			),
			"import.meta.env.DEV_SERVER_PORT": JSON.stringify(getPortSync()),
		},

		server: {
			port: getPortSync(),
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
			},
		},
	},
});
