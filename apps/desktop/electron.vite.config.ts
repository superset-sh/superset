import { dirname, normalize, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import reactPlugin from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import { config } from "dotenv";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import injectProcessEnvPlugin from "rollup-plugin-inject-process-env";
import tsconfigPathsPlugin from "vite-tsconfig-paths";
import { main, resources } from "./package.json";
import { settings } from "./src/lib/electron-router-dom";

// Load .env from monorepo root
// Use override: true to ensure .env values take precedence over inherited env vars
config({ path: resolve(__dirname, "../../.env"), override: true });

const [nodeModules, devFolder] = normalize(dirname(main)).split(/\/|\\/g);
const devPath = [nodeModules, devFolder].join("/");

const tsconfigPaths = tsconfigPathsPlugin({
	projects: [resolve("tsconfig.json")],
});

export default defineConfig({
	main: {
		plugins: [tsconfigPaths, externalizeDepsPlugin()],

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
	},

	preload: {
		plugins: [tsconfigPaths, externalizeDepsPlugin()],

		build: {
			outDir: resolve(devPath, "preload"),
		},
	},

	renderer: {
		define: {
			"process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
			"process.platform": JSON.stringify(process.platform),
		},

		server: {
			port: Number(process.env.VITE_DEV_SERVER_PORT) || settings.port,
			strictPort: true, // Fail if port is already in use
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

				output: {
					dir: resolve(devPath, "renderer"),
				},
			},
		},
	},
});
