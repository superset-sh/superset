import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
import { transformAsync } from "@babel/core";
import type { Plugin } from "vite";

import { main, resources } from "../package.json";

export const devPath = normalize(dirname(main)).split(/\/|\\/g)[0];

function copyDir({ src, dest }: { src: string; dest: string }): void {
	if (!existsSync(src)) return;

	if (existsSync(dest)) {
		rmSync(dest, { recursive: true });
	}
	mkdirSync(dest, { recursive: true });
	cpSync(src, dest, { recursive: true });
}

export function defineEnv(
	value: string | undefined,
	fallback?: string,
): string {
	return JSON.stringify(value ?? fallback);
}

const RESOURCES_TO_COPY = [
	{
		src: resolve(__dirname, "..", resources, "sounds"),
		dest: resolve(__dirname, "..", devPath, "resources/sounds"),
	},
	{
		src: resolve(__dirname, "..", resources, "tray"),
		dest: resolve(__dirname, "..", devPath, "resources/tray"),
	},
	{
		src: resolve(__dirname, "..", resources, "browser-extension"),
		dest: resolve(__dirname, "..", devPath, "resources/browser-extension"),
	},
	{
		src: resolve(__dirname, "../../../packages/local-db/drizzle"),
		dest: resolve(__dirname, "..", devPath, "resources/migrations"),
	},
	{
		src: resolve(__dirname, "../../../packages/host-service/drizzle"),
		dest: resolve(__dirname, "..", devPath, "resources/host-migrations"),
	},
	{
		src: resolve(__dirname, "../../../packages/chat-runtime/src/db/drizzle"),
		dest: resolve(__dirname, "..", devPath, "resources/chat-migrations"),
	},
	{
		src: resolve(__dirname, "../../../packages/agent-setup/templates"),
		dest: resolve(__dirname, "..", devPath, "main/templates"),
	},
	// Must come after the templates copy above: copyDir wipes its dest, and
	// this nests inside it. Bundles the repo's Claude Code plugin so
	// agent-setup can provision its skills into user environments at boot.
	{
		src: resolve(__dirname, "../../../plugins/superset"),
		dest: resolve(__dirname, "..", devPath, "main/templates/plugin"),
	},
];

/**
 * Copies resources to dist/ for preview/production mode.
 * In preview mode, __dirname resolves relative to dist/main, so resources
 * need to be copied there for the main process to access them.
 */
export function copyResourcesPlugin(): Plugin {
	return {
		name: "copy-resources",
		writeBundle() {
			for (const resource of RESOURCES_TO_COPY) {
				copyDir(resource);
			}
		},
	};
}

/**
 * Injects environment variables into index.html CSP.
 */
// The renderer gets the Lingui macro through @vitejs/plugin-react's babel
// option; the main process has no babel step, so run the macro directly.
export function linguiMacroPlugin(): Plugin {
	return {
		name: "lingui-macro",
		enforce: "pre",
		async transform(code, id) {
			if (!/\.tsx?$/.test(id) || id.includes("/node_modules/")) return null;
			if (!code.includes("@lingui/core/macro")) return null;
			const result = await transformAsync(code, {
				filename: id,
				babelrc: false,
				configFile: false,
				sourceMaps: true,
				parserOpts: { plugins: ["typescript"] },
				plugins: ["@lingui/babel-plugin-lingui-macro"],
			});
			return result?.code ? { code: result.code, map: result.map } : null;
		},
	};
}

export function htmlEnvTransformPlugin(): Plugin {
	return {
		name: "html-env-transform",
		transformIndexHtml(html) {
			return html
				.replace(
					/%NEXT_PUBLIC_API_URL%/g,
					process.env.NEXT_PUBLIC_API_URL || "https://api.superset.sh",
				)
				.replace(
					/%NEXT_PUBLIC_STREAMS_URL%/g,
					process.env.NEXT_PUBLIC_STREAMS_URL || "https://streams.superset.sh",
				)
				.replace(
					/%RELAY_URL%/g,
					process.env.RELAY_URL || "https://relay.superset.sh",
				);
		},
	};
}
