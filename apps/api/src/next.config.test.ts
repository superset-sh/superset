import { expect, mock, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

const modes = [undefined, "0", "1", "other"];
if (process.env.NEXT_IMAGE_CONFIG_FIXTURE !== "1") {
	for (const mode of modes)
		test(`standalone config ${mode ?? "unset"}`, () => {
			const cwd = mkdtempSync("/tmp/next-image-config-");
			try {
				const child = spawnSync(
					process.execPath,
					["--no-env-file", "test", import.meta.path],
					{
						cwd,
						env: {
							PATH: "/usr/bin:/bin",
							TMPDIR: "/tmp",
							NODE_ENV: "production",
							NEXT_IMAGE_CONFIG_FIXTURE: "1",
							...(mode === undefined ? {} : { NEXT_OUTPUT_STANDALONE: mode }),
						},
						timeout: 5000,
						stdio: "pipe",
					},
				);
				process.stdout.write(child.stdout);
				process.stderr.write(child.stderr);
				if (child.error) throw child.error;
				expect(child.status).toBe(0);
			} finally {
				rmSync(cwd, { recursive: true, force: true });
			}
		});
} else {
	const deny = () => {
		throw Error("Unexpected external operation");
	};
	globalThis.fetch = Object.assign(async () => deny(), { preconnect: deny });
	const net = await import("node:net");
	spyOn(net.Socket.prototype, "connect").mockImplementation(deny);
	const cp = await import("node:child_process");
	for (const key of [
		"spawn",
		"spawnSync",
		"exec",
		"execSync",
		"execFile",
		"execFileSync",
	] as const)
		spyOn(cp, key).mockImplementation(deny);
	spyOn(Bun, "spawn").mockImplementation(deny);
	spyOn(Bun, "spawnSync").mockImplementation(deny);
	mock.module("dotenv", () => ({ config: deny }));
	const withSentryConfig = (config: NextConfig) => config;
	mock.module("@sentry/nextjs", () => ({ withSentryConfig }));

	test("genuine config retains defaults and opts into monorepo standalone only for 1", async () => {
		expect(
			Object.is(
				(await import("@sentry/nextjs")).withSentryConfig,
				withSentryConfig,
			),
		).toBe(true);
		const { default: config } = await import("../next.config.ts");
		const enabled = process.env.NEXT_OUTPUT_STANDALONE === "1";
		expect(config.output).toBe(enabled ? "standalone" : undefined);
		expect(config.outputFileTracingRoot).toBe(
			enabled ? resolve(import.meta.dir, "../../..") : undefined,
		);
		if (!enabled) {
			expect(Object.hasOwn(config, "output")).toBe(false);
			expect(Object.hasOwn(config, "outputFileTracingRoot")).toBe(false);
		}
		expect(config.reactCompiler).toBe(true);
		expect(config.typescript?.ignoreBuildErrors).toBe(true);
		expect(config.experimental?.swcPlugins).toEqual([
			["@lingui/swc-plugin", {}],
		]);
	});
}
