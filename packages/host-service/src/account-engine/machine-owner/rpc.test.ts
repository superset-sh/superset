import { expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import type { AccountEngine } from "../account-engine.ts";
import { createLocalAccountService } from "../account-service.ts";
import type { QuotaStore } from "../quota-store.ts";
import { serviceArguments } from "./protocol.ts";
import { AccountRpc } from "./rpc.ts";

it("supports owner callbacks and preserves mutation refusal codes", async () => {
	let accepted: AccountRpc | undefined;
	const server = createServer((socket) => {
		accepted = new AccountRpc(socket, async (method) => {
			if (method === "quota")
				return {
					fetchedAt: new Date(100),
					windows: [{ resetsAt: new Date(200) }],
				};
			if (method === "remove")
				throw new TRPCError({ code: "BAD_REQUEST", message: "active-account" });
			return accepted?.request("terminal", ["org-terminal"]);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("missing port");
	const client = new AccountRpc(
		createConnection({ port: address.port, host: "127.0.0.1" }),
		async (_method, args) => args[0],
	);
	try {
		expect(await client.request<string>("switch")).toBe("org-terminal");
		const quota = await client.request<{
			fetchedAt: Date;
			windows: { resetsAt: Date }[];
		}>("quota");
		expect(quota.fetchedAt.getTime()).toBe(100);
		expect(quota.windows[0]?.resetsAt.getTime()).toBe(200);
		try {
			await client.request("remove");
			throw new Error("expected refusal");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("BAD_REQUEST");
		}
		client.socket.destroy();
		await expect(client.request("switch")).rejects.toThrow(
			"account-owner-disconnected",
		);
	} finally {
		client.socket.destroy();
		accepted?.socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

it("allows a moving owner's resume callback to seed trust without re-entering its engine lane", async () => {
	const dir = mkdtempSync(join(tmpdir(), "account-owner-trust-"));
	const file = join(dir, ".claude.json");
	writeFileSync(
		file,
		JSON.stringify({ oauthAccount: { accountUuid: "original" } }),
	);
	let laneHeld = false;
	const engine = {
		status: () => ({ claude: { platformSupported: true } }),
		ownsLock: () => true,
		runExclusive: async <T>(operation: () => Promise<T>) => {
			if (laneHeld) throw new Error("reentrant engine lane");
			laneHeld = true;
			try {
				return await operation();
			} finally {
				laneHeld = false;
			}
		},
	} as unknown as AccountEngine;
	const service = createLocalAccountService(engine, {} as QuotaStore);
	let peer: AccountRpc | undefined;
	const server = createServer((socket) => {
		peer = new AccountRpc(socket, async (method, args) => {
			if (method === "move")
				return engine.runExclusive(async () => peer?.request("resume"));
			if (method === "service:seedClaudeFolderTrust") {
				expect(laneHeld).toBe(true);
				const [input] = serviceArguments.seedClaudeFolderTrust.parse(args);
				return service.seedClaudeFolderTrust(input);
			}
			throw new Error("unexpected method");
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("missing port");
	const client = new AccountRpc(
		createConnection({ port: address.port, host: "127.0.0.1" }),
		async () => {
			await client.request("service:seedClaudeFolderTrust", [
				{ stateFile: file, folderPath: dir },
			]);
		},
	);
	try {
		await client.request("move");
		const written = JSON.parse(readFileSync(file, "utf8"));
		expect(written.oauthAccount.accountUuid).toBe("original");
		expect(written.projects[dir].hasTrustDialogAccepted).toBe(true);
	} finally {
		client.socket.destroy();
		peer?.socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		rmSync(dir, { recursive: true, force: true });
	}
});

it("refuses a trust write when ownership is lost during its file read", async () => {
	const previousHome = process.env.SUPERSET_HOME_DIR;
	const dir = mkdtempSync(join(tmpdir(), "account-owner-trust-lost-"));
	process.env.SUPERSET_HOME_DIR = dir;
	const file = join(dir, ".claude.json");
	const original = JSON.stringify({
		oauthAccount: { accountUuid: "original" },
	});
	writeFileSync(file, original);
	let checks = 0;
	const service = createLocalAccountService(
		{
			status: () => ({ claude: { platformSupported: true } }),
			ownsLock: () => ++checks === 1,
		} as unknown as AccountEngine,
		{} as QuotaStore,
	);
	try {
		await expect(
			service.seedClaudeFolderTrust({ stateFile: file, folderPath: dir }),
		).rejects.toThrow("lock-loser");
		expect(readFileSync(file, "utf8")).toBe(original);
	} finally {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(dir, { recursive: true, force: true });
	}
});
