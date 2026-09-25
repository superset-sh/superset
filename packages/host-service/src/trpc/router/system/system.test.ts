import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getHostId } from "@superset/shared/host-info";
import { configureSelfUpdater } from "../../../self-update";
import type { HostServiceContext } from "../../../types";
import { systemRouter } from "./system";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
function fixture(allowed: boolean | Error) {
	const root = mkdtempSync(join(tmpdir(), "update-auth-"));
	roots.push(root);
	mkdirSync(join(root, "bin"));
	writeFileSync(join(root, "bin/superset"), "");
	writeFileSync(join(root, "bin/superset-host"), "");
	let downloads = 0;
	configureSelfUpdater({
		installSource: "cli",
		execPath: join(root, "lib/node"),
		stateDir: join(root, "state"),
		currentVersion: "1.26.0",
		port: 0,
		secret: "test",
		stopServing: async () => {},
		runCliUpdate: async () => {
			downloads++;
			return { ok: false, stdout: "", stderr: "test download ended" };
		},
		log: () => {},
	});
	const checks: unknown[] = [];
	const context = {
		isAuthenticated: true,
		organizationId: "org",
		userId: "requester",
		api: {
			host: {
				authorizeUpdate: {
					query: async (input: unknown) => {
						checks.push(input);
						if (allowed instanceof Error) throw allowed;
						return { allowed };
					},
				},
			},
		},
	} as unknown as HostServiceContext;
	return {
		context,
		checks,
		get downloads() {
			return downloads;
		},
	};
}
test("direct API calls by non-owners cannot start the updater", async () => {
	const f = fixture(false);
	await expect(
		systemRouter.createCaller(f.context).update({ version: "1.27.0" }),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(f.downloads).toBe(0);
});
test("a PSK without caller identity cannot fall back to the host's owner credentials", async () => {
	const f = fixture(true);
	f.context.userId = undefined;
	await expect(
		systemRouter.createCaller(f.context).update({ version: "1.27.0" }),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(f.checks).toEqual([]);
	expect(f.downloads).toBe(0);
});
test("ownership lookup failure denies the update before download", async () => {
	const f = fixture(new Error("cloud unavailable"));
	await expect(
		systemRouter.createCaller(f.context).update({ version: "1.27.0" }),
	).rejects.toThrow("cloud unavailable");
	expect(f.downloads).toBe(0);
});
test("an authenticated owner can update; target machine and identity come from server context", async () => {
	const f = fixture(true);
	await systemRouter.createCaller(f.context).update({
		version: "1.27.0",
		userId: "forged-owner",
		machineId: "other-machine",
	} as { version: string });
	expect(f.checks).toEqual([
		{ organizationId: "org", machineId: getHostId(), userId: "requester" },
	]);
	expect(f.downloads).toBe(1);
});
test("missing PSK authentication is rejected before cloud authorization", async () => {
	const f = fixture(true);
	f.context.isAuthenticated = false;
	await expect(
		systemRouter.createCaller(f.context).update({ version: "1.27.0" }),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	expect(f.checks).toEqual([]);
	expect(f.downloads).toBe(0);
});
