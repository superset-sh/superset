import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
import type { Plugin } from "vite";

import { main, resources } from "../package.json";

// Must match PORTS.VITE_DEV_SERVER in src/shared/constants.ts
export const DEV_SERVER_PORT = 5927;

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

const REQUIRED_ENV_VARS = [
	"GOOGLE_CLIENT_ID",
	"GH_CLIENT_ID",
	"STREAMS_URL",
	"STREAMS_SECRET",
] as const;

/**
 * Validates that required environment variables are present at build time.
 * Skipped when SKIP_ENV_VALIDATION is set (development only).
 */
export function validateRequiredEnv(): void {
	if (process.env.SKIP_ENV_VALIDATION) return;

	const missing = REQUIRED_ENV_VARS.filter(
		(key) => !process.env[key]?.trim(),
	);

	if (missing.length > 0) {
		throw new Error(
			[
				"Missing required environment variables:",
				...missing.map((v) => `  - ${v}`),
				"",
				"Set SKIP_ENV_VALIDATION=1 to bypass this check during development.",
			].join("\n"),
		);
	}
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
			return html.replace(
				/%NEXT_PUBLIC_API_URL%/g,
				process.env.NEXT_PUBLIC_API_URL || "https://api.superset.sh",
			);
		},
	};
}
