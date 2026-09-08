import { expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EngineSettings } from "../types.ts";
import { readOwnerManifest } from "./lifecycle.ts";
import { startMachineAccountOwner } from "./owner.ts";
import { AccountRpc } from "./rpc.ts";

it("one owner serves shared settings to two orgs and survives an org disconnect", async () => {
	const previous = process.env.SUPERSET_HOME_DIR;
	const dir = mkdtempSync(join(tmpdir(), "account-owner-test-"));
	process.env.SUPERSET_HOME_DIR = dir;
	const clients: AccountRpc[] = [];
	let close: (() => Promise<void>) | null = null;
	try {
		close = await startMachineAccountOwner();
		expect(close).not.toBeNull();
		const manifest = readOwnerManifest();
		if (!manifest) throw new Error("owner not published");
		expect(await startMachineAccountOwner()).toBeNull();
		expect(readOwnerManifest()?.token).toBe(manifest.token);
		for (const org of ["first-org", "second-org"]) {
			const rpc = new AccountRpc(
				createConnection({ host: "127.0.0.1", port: manifest.port }),
				async () => null,
			);
			clients.push(rpc);
			await rpc.request("register", [manifest.token, org]);
		}
		await clients[0]?.request("service:setSettings", [
			"claude",
			{ thresholdPercent: 77 },
		]);
		const settings = await clients[1]?.request<EngineSettings>(
			"service:getSettings",
		);
		expect(settings?.claude.thresholdPercent).toBe(77);
		clients[0]?.socket.destroy();
		expect(await clients[1]?.request<boolean>("service:ownsLock")).toBe(true);
		const unauthorized = new AccountRpc(
			createConnection({ host: "127.0.0.1", port: manifest.port }),
			async () => null,
		);
		clients.push(unauthorized);
		await expect(unauthorized.request("service:getSettings")).rejects.toThrow(
			"unauthorized-account-client",
		);
	} finally {
		for (const rpc of clients) rpc.socket.destroy();
		await close?.();
		if (previous === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previous;
		rmSync(dir, { recursive: true, force: true });
	}
});
