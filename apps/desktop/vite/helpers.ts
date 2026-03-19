import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
import type { Plugin } from "vite";

import { main, resources } from "../package.json";

export const devPath = normalize(dirname(main)).split(/\/|\\/g)[0];

/**
 * Returns the monorepo root directory (two levels above apps/desktop).
 *
 * When the desktop app runs from a git worktree located inside `.git/`,
 * Vite's automatic workspace-root detection fails because the path traverses
 * `.git/`. Explicitly providing this path to `server.fs.allow` ensures Vite
 * can serve renderer files regardless of worktree location.
 */
export function getMonorepoRoot(baseDir: string = __dirname): string {
	// baseDir is apps/desktop/vite → go up three levels to reach monorepo root
	return resolve(baseDir, "../../..");
}

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
