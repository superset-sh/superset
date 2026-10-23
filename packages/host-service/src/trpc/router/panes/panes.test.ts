import { Database } from "bun:sqlite";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { PaneLayoutRequest } from "@superset/shared/pane-layout-ops";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { panesRouter } from "./panes";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

let paneTerminalId = "term-1";
let conflictOnClose = false;
const ops: PaneLayoutRequest["op"][] = [];

const bridge = Bun.serve({
	port: 0,
	async fetch(req) {
		const { op } = (await req.json()) as PaneLayoutRequest;
		ops.push(op);
		if (op.type === "close" && conflictOnClose) {
			return Response.json({ error: "Pane pane-1 changed" }, { status: 409 });
		}
		return Response.json({
			paneId: null,
			tabId: null,
			layout: {
				activeTabId: "tab-1",
				tabs: [
					{
						id: "tab-1",
						title: null,
						active: true,
						activePaneId: "pane-1",
						layout: { type: "pane", paneId: "pane-1" },
						panes: [
							{
								id: "pane-1",
								kind: "terminal",
								title: null,
								terminalId: paneTerminalId,
								active: true,
							},
						],
					},
				],
			},
		});
	},
});

afterAll(() => bridge.stop(true));

function createCaller() {
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	db.insert(schema.workspaces)
		.values({
			id: "ws-1",
			projectId: null,
			worktreePath: "/tmp/ws-1",
			branch: "main",
			name: "ws-1",
			type: "session",
			createdAt: 0,
			updatedAt: 0,
		})
		.run();
	const ctx = {
		db,
		isAuthenticated: true,
		browserBridge: { url: bridge.url.origin, secret: "secret" },
		terminalAgentStore: { listByWorkspace: () => [] },
	} as unknown as HostServiceContext;
	return panesRouter.createCaller(ctx);
}

beforeEach(() => {
	paneTerminalId = "term-1";
	conflictOnClose = false;
	ops.length = 0;
});

describe("panes.close with expectedTerminalId", () => {
	test("passes the expected terminal to the desktop", async () => {
		const result = await createCaller().close({
			workspaceId: "ws-1",
			paneId: "pane-1",
			keepTerminal: true,
			expectedTerminalId: "term-1",
		});
		expect(result.terminalId).toBe("term-1");
		expect(ops.at(-1)).toEqual({
			type: "close",
			paneId: "pane-1",
			keepTerminal: true,
			expectedTerminalId: "term-1",
		});
	});

	test("does not ask the desktop to close a pane that shows another terminal", async () => {
		paneTerminalId = "term-2";
		await expect(
			createCaller().close({
				workspaceId: "ws-1",
				paneId: "pane-1",
				keepTerminal: true,
				expectedTerminalId: "term-1",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(ops.map((op) => op.type)).toEqual(["list"]);
	});

	test("reports the desktop's refusal as CONFLICT", async () => {
		conflictOnClose = true;
		await expect(
			createCaller().close({
				workspaceId: "ws-1",
				paneId: "pane-1",
				keepTerminal: true,
				expectedTerminalId: "term-1",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});
});
