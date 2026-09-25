import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostServiceContext } from "../../../types";
import { healthRouter, sandboxBootReport } from "./health";

const ENV_KEYS = [
	"SUPERSET_HOST_RUN_MODE",
	"SUPERSET_SANDBOX_BOOT_LOG",
] as const;

describe("health.check", () => {
	let dir: string;
	const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "health-boot-"));
		for (const key of ENV_KEYS) saved[key] = process.env[key];
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
		for (const key of ENV_KEYS) {
			if (saved[key] === undefined) delete process.env[key];
			else process.env[key] = saved[key];
		}
	});

	it("serialises the current boot's stamps and the runtime in sandbox mode", async () => {
		const log = join(dir, "boot.log");
		writeFileSync(
			log,
			[
				"1789000000000 boot.start",
				"1789000000500 host.exec",
				"1789000009000 boot.start",
				"1789000009100 checkout.skipped",
				"1789000009200 host.exec",
				"1789000010400 host.listening",
				"",
			].join("\n"),
		);
		process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
		process.env.SUPERSET_SANDBOX_BOOT_LOG = log;
		const caller = healthRouter.createCaller({} as HostServiceContext);
		const result = await caller.check();
		expect(result.status).toBe("ok");
		expect(result.sandboxBoot).toEqual({
			stamps: [
				{ phase: "boot.start", at: 1789000009000 },
				{ phase: "checkout.skipped", at: 1789000009100 },
				{ phase: "host.exec", at: 1789000009200 },
				{ phase: "host.listening", at: 1789000010400 },
			],
			runtime: { node: process.version, hostService: result.version },
			bundle: null,
			ready: { "host-service": false, display: false, checkout: false },
		});
	});

	it("reports no boot outside a sandbox", () => {
		expect(
			sandboxBootReport({ SUPERSET_HOST_RUN_MODE: "local" }),
		).toBeUndefined();
		expect(sandboxBootReport({})).toBeUndefined();
	});
});
