import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
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
		src: resolve(__dirname, "../src/main/lib/agent-setup/templates"),
		dest: resolve(__dirname, "..", devPath, "main/templates"),
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
					/%NEXT_PUBLIC_ELECTRIC_URL%/g,
					new URL(
						process.env.NEXT_PUBLIC_ELECTRIC_URL ||
							"https://electric-proxy.avi-6ac.workers.dev",
					).origin,
				)
				.replace(
					/%NEXT_PUBLIC_STREAMS_URL%/g,
					process.env.NEXT_PUBLIC_STREAMS_URL || "https://streams.superset.sh",
				);
		},
	};
}
