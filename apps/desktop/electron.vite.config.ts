import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import reactPlugin from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import tsconfigPathsPlugin from "vite-tsconfig-paths";

const tsconfigPaths = tsconfigPathsPlugin({
	projects: [resolve("tsconfig.json")],
});

export default defineConfig({
	main: {
		plugins: [tsconfigPaths, externalizeDepsPlugin()],
		build: {
			outDir: "dist/main",
			rollupOptions: {
				input: {
					index: resolve("src/main/index.ts"),
				},
			},
		},
	},

	preload: {
		plugins: [tsconfigPaths, externalizeDepsPlugin()],
		build: {
			outDir: "dist/preload",
		},
	},

	renderer: {
		// Environment variable configuration
		// Load from monorepo root, only expose VITE_ prefixed vars to renderer
		envDir: resolve(__dirname, "../.."),
		envPrefix: ["VITE_"],

		// Define compile-time constants
		define: {
			"process.platform": JSON.stringify(process.platform),
		},

		// Dev server configuration
		server: {
			port: 4927,
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

		// Public assets directory
		publicDir: resolve("src/resources/public"),

		build: {
			outDir: "dist/renderer",
			rollupOptions: {
				input: {
					index: resolve("src/renderer/index.html"),
				},
			},
		},

		// Optimize workspace package handling
		optimizeDeps: {
			// Include workspace packages for pre-bundling
			include: ["@superset/ui", "@superset/api"],
		},

		resolve: {
			// Deduplicate react/react-dom from workspace packages
			dedupe: ["react", "react-dom"],
		},
	},
});
