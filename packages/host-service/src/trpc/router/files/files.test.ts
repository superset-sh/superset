import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { filesRouter } from "./files";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
const WORKSPACE_ID = "2b1e8c7e-1234-4abc-8def-0123456789ab";
const PROJECT_ID = "4d3a0e9a-9abc-4def-8123-0123456789ab";
const BRIDGE = { url: "http://127.0.0.1:4321", secret: "s3cret" };

let root: string;
let worktree: string;
let db: ReturnType<typeof drizzle<typeof schema>>;
const originalFetch = globalThis.fetch;

type BridgeCall = { url: string; init: RequestInit };
let bridgeCalls: BridgeCall[];
let bridgeResponse: { status: number; body: unknown };

function stubBridge(): void {
	bridgeCalls = [];
	bridgeResponse = { status: 200, body: { paneIds: ["pane-a"] } };
	globalThis.fetch = mock(
		async (url: string | URL | Request, init?: RequestInit) => {
			bridgeCalls.push({ url: String(url), init: init ?? {} });
			return new Response(JSON.stringify(bridgeResponse.body), {
				status: bridgeResponse.status,
				headers: { "Content-Type": "application/json" },
			});
		},
	) as unknown as typeof fetch;
}

function createCaller({ desktopAttached = true } = {}) {
	const ctx = {
		db,
		isAuthenticated: true,
		browserBridge: desktopAttached ? BRIDGE : undefined,
	} as unknown as HostServiceContext;
	return filesRouter.createCaller(ctx);
}

function seedWorkspace(): void {
	db.insert(schema.workspaces)
		.values({
			id: WORKSPACE_ID,
			projectId: PROJECT_ID,
			worktreePath: worktree,
			branch: "main",
			name: "test",
		})
		.run();
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "files-router-test-"));
	worktree = join(root, "worktree");
	mkdirSync(join(worktree, "src"), { recursive: true });
	writeFileSync(join(worktree, "src", "a.ts"), "export {};\n");
	writeFileSync(join(worktree, "src", "b.ts"), "export {};\n");
	const sqlite = new Database(":memory:");
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	stubBridge();
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	chmodSync(join(worktree, "src"), 0o755);
	rmSync(root, { recursive: true, force: true });
});

describe("files.open", () => {
	it("forwards the request to the desktop bridge and returns the pane ids", async () => {
		seedWorkspace();
		bridgeResponse = { status: 200, body: { paneIds: ["pane-a", "pane-b"] } };
		const a = join(worktree, "src", "a.ts");
		const b = join(worktree, "src", "b.ts");

		const result = await createCaller().open({
			workspaceId: WORKSPACE_ID,
			paths: [a, b],
			line: 12,
			target: "new-tab",
		});

		expect(result).toEqual({ paneIds: ["pane-a", "pane-b"] });
		expect(bridgeCalls).toHaveLength(1);
		const [call] = bridgeCalls;
		expect(call?.url).toBe(`${BRIDGE.url}/open-file`);
		expect(call?.init.method).toBe("POST");
		expect((call?.init.headers as Record<string, string>).Authorization).toBe(
			`Bearer ${BRIDGE.secret}`,
		);
		expect(JSON.parse(String(call?.init.body))).toEqual({
			workspaceId: WORKSPACE_ID,
			projectId: PROJECT_ID,
			paths: [a, b],
			line: 12,
			target: "new-tab",
		});
	});

	it("defaults to the current tab with no line", async () => {
		seedWorkspace();
		await createCaller().open({
			workspaceId: WORKSPACE_ID,
			paths: [join(worktree, "src", "a.ts")],
		});
		expect(JSON.parse(String(bridgeCalls[0]?.init.body))).toMatchObject({
			target: "current-tab",
		});
		expect(JSON.parse(String(bridgeCalls[0]?.init.body))).not.toHaveProperty(
			"line",
		);
	});

	it("fails before touching the bridge on a host with no desktop attached", async () => {
		seedWorkspace();
		await expect(
			createCaller({ desktopAttached: false }).open({
				workspaceId: WORKSPACE_ID,
				paths: [join(worktree, "src", "a.ts")],
			}),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(bridgeCalls).toHaveLength(0);
	});

	it("rejects an unknown workspace", async () => {
		await expect(
			createCaller().open({
				workspaceId: WORKSPACE_ID,
				paths: [join(worktree, "src", "a.ts")],
			}),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: "Workspace not found",
		});
		expect(bridgeCalls).toHaveLength(0);
	});

	it.each([
		["a relative path", "src/a.ts", "BAD_REQUEST"],
		["a directory", "{worktree}/src", "BAD_REQUEST"],
		["a missing file", "{worktree}/src/missing.ts", "NOT_FOUND"],
	])("rejects %s without calling the bridge", async (_label, path, code) => {
		seedWorkspace();
		await expect(
			createCaller().open({
				workspaceId: WORKSPACE_ID,
				paths: [path.replace("{worktree}", worktree)],
			}),
		).rejects.toMatchObject({ code });
		expect(bridgeCalls).toHaveLength(0);
	});

	// Permission bits are not enforced for root, and neither test has a Windows equivalent.
	const posix = process.platform !== "win32";
	const unprivileged = posix && process.getuid?.() !== 0;

	it.skipIf(!unprivileged)(
		"reports an unreadable path as a read failure, not a missing file",
		async () => {
			seedWorkspace();
			chmodSync(join(worktree, "src"), 0o000);
			await expect(
				createCaller().open({
					workspaceId: WORKSPACE_ID,
					paths: [join(worktree, "src", "a.ts")],
				}),
			).rejects.toMatchObject({
				code: "INTERNAL_SERVER_ERROR",
				message: expect.stringContaining("EACCES"),
			});
			expect(bridgeCalls).toHaveLength(0);
		},
	);

	it.skipIf(!posix)("rejects a path that is not a regular file", async () => {
		seedWorkspace();
		const fifo = join(worktree, "src", "pipe");
		execFileSync("mkfifo", [fifo]);
		await expect(
			createCaller().open({ workspaceId: WORKSPACE_ID, paths: [fifo] }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: `Not a regular file: ${fifo}`,
		});
		expect(bridgeCalls).toHaveLength(0);
	});

	it("surfaces a bridge timeout as a not-found the caller can act on", async () => {
		seedWorkspace();
		bridgeResponse = {
			status: 504,
			body: { error: "No workspace view picked up the file-open request." },
		};
		await expect(
			createCaller().open({
				workspaceId: WORKSPACE_ID,
				paths: [join(worktree, "src", "a.ts")],
			}),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: "No workspace view picked up the file-open request.",
		});
	});
});
