import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { SelectTerminalSessionLocation } from "@superset/local-db/schema";
import {
	getSessionLocation,
	LEGACY_SESSION_LOCATION_LOG_PATH,
	markSessionLocationExited,
	type SessionLocationEntry,
	type SessionLocationStoreAdapter,
	setLegacySessionLocationSourceForTests,
	setSessionLocationStoreAdapterForTests,
	updateSessionLocationAgentIdentity,
	upsertSessionLocation,
} from "./session-location-log";

function toRecord(entry: SessionLocationEntry): SelectTerminalSessionLocation {
	return {
		paneId: entry.paneId,
		tabId: entry.tabId,
		workspaceId: entry.workspaceId,
		workspaceName: entry.workspaceName ?? null,
		workspacePath: entry.workspacePath ?? null,
		rootPath: entry.rootPath ?? null,
		cwd: entry.cwd,
		command: entry.command ?? null,
		pid: entry.pid,
		agentId: entry.agentId ?? null,
		agentSessionId: entry.agentSessionId ?? null,
		status: entry.status,
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
		exitedAt: entry.exitedAt ?? null,
		exitReason: entry.exitReason ?? null,
		locationKey: entry.locationKey,
	};
}

describe("session-location-log", () => {
	let store = new Map<string, SelectTerminalSessionLocation>();

	const adapter: SessionLocationStoreAdapter = {
		hasAny: () => store.size > 0,
		getByPaneId: (paneId) => store.get(paneId),
		upsert: (entry) => {
			store.set(entry.paneId, toRecord(entry));
		},
		update: (paneId, patch) => {
			const entry = store.get(paneId);
			if (!entry) return;
			store.set(paneId, {
				...entry,
				...(Object.hasOwn(patch, "agentId")
					? { agentId: patch.agentId ?? null }
					: {}),
				...(Object.hasOwn(patch, "agentSessionId")
					? { agentSessionId: patch.agentSessionId ?? null }
					: {}),
				...(Object.hasOwn(patch, "status") && patch.status
					? { status: patch.status }
					: {}),
				...(Object.hasOwn(patch, "pid") ? { pid: patch.pid ?? null } : {}),
				...(Object.hasOwn(patch, "updatedAt") && patch.updatedAt !== undefined
					? { updatedAt: patch.updatedAt }
					: {}),
				...(Object.hasOwn(patch, "exitedAt")
					? { exitedAt: patch.exitedAt ?? null }
					: {}),
				...(Object.hasOwn(patch, "exitReason")
					? { exitReason: patch.exitReason ?? null }
					: {}),
			});
		},
	};

	beforeEach(() => {
		store = new Map();
		setSessionLocationStoreAdapterForTests(adapter);
	});

	afterEach(() => {
		setLegacySessionLocationSourceForTests(null);
		setSessionLocationStoreAdapterForTests(null);
	});

	it("preserves an existing agent session id when a follow-up update omits it", async () => {
		upsertSessionLocation({
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "workspace-1",
			cwd: "/tmp/workspace",
			pid: 123,
		});
		await getSessionLocation("pane-1");

		updateSessionLocationAgentIdentity({
			paneId: "pane-1",
			agentId: "codex",
			agentSessionId: "session-1",
		});

		const beforeEmptyUpdate = await getSessionLocation("pane-1");
		expect(beforeEmptyUpdate).toMatchObject({
			agentId: "codex",
			agentSessionId: "session-1",
		});

		updateSessionLocationAgentIdentity({
			paneId: "pane-1",
			agentId: "codex",
			agentSessionId: undefined,
		});

		const afterEmptyUpdate = await getSessionLocation("pane-1");
		expect(afterEmptyUpdate).toMatchObject({
			agentId: "codex",
			agentSessionId: "session-1",
		});
	});

	it("clears agent identity when a new shell replaces the prior session", async () => {
		upsertSessionLocation({
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "workspace-1",
			cwd: "/tmp/workspace",
			pid: 123,
		});
		updateSessionLocationAgentIdentity({
			paneId: "pane-1",
			agentId: "codex",
			agentSessionId: "session-1",
		});

		upsertSessionLocation({
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "workspace-1",
			cwd: "/tmp/workspace",
			pid: 456,
		});

		const nextEntry = await getSessionLocation("pane-1");
		expect(nextEntry).toMatchObject({
			agentId: undefined,
			agentSessionId: undefined,
			pid: 456,
			status: "available",
		});
	});

	it("marks the persisted row exited without deleting it", async () => {
		upsertSessionLocation({
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "workspace-1",
			cwd: "/tmp/workspace",
			pid: 123,
		});

		markSessionLocationExited({
			paneId: "pane-1",
			exitReason: "killed",
		});

		const exitedEntry = await getSessionLocation("pane-1");
		expect(exitedEntry).toMatchObject({
			status: "exited",
			pid: null,
			exitReason: "killed",
		});
		expect(exitedEntry?.exitedAt).toBeNumber();
	});

	it("migrates the legacy JSON log into the db-backed store", async () => {
		let archivedPath: string | null = null;
		setLegacySessionLocationSourceForTests({
			exists: () => true,
			read: () =>
				JSON.stringify({
					sessions: {
						"pane-1": {
							paneId: "pane-1",
							tabId: "tab-1",
							workspaceId: "workspace-1",
							workspaceName: "Workspace One",
							workspacePath: "/tmp/workspace",
							rootPath: "/tmp",
							cwd: "/tmp/workspace",
							command: "codex",
							pid: 321,
							agentId: "codex",
							agentSessionId: "session-legacy",
							status: "available",
							createdAt: 100,
							updatedAt: 200,
							locationKey: "workspace-1:tab-1:pane-1",
						},
					},
				}),
			archive: (path) => {
				archivedPath = path;
			},
		});

		const migratedEntry = await getSessionLocation("pane-1");
		expect(migratedEntry).toMatchObject({
			paneId: "pane-1",
			agentId: "codex",
			agentSessionId: "session-legacy",
			cwd: "/tmp/workspace",
			locationKey: "workspace-1:tab-1:pane-1",
		});
		expect(archivedPath ?? "").toBe(LEGACY_SESSION_LOCATION_LOG_PATH);
	});

	it("does not overwrite existing db state from a stale legacy JSON log", async () => {
		let readCalls = 0;
		let archivedPath: string | null = null;

		upsertSessionLocation({
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "workspace-1",
			cwd: "/tmp/current",
			pid: 123,
		});
		updateSessionLocationAgentIdentity({
			paneId: "pane-1",
			agentId: "codex",
			agentSessionId: "session-current",
		});

		setLegacySessionLocationSourceForTests({
			exists: () => true,
			read: () => {
				readCalls += 1;
				return JSON.stringify({
					sessions: {
						"pane-1": {
							paneId: "pane-1",
							tabId: "tab-1",
							workspaceId: "workspace-1",
							cwd: "/tmp/stale",
							pid: 999,
							agentId: "codex",
							agentSessionId: "session-stale",
							status: "available",
							createdAt: 1,
							updatedAt: 2,
							locationKey: "workspace-1:tab-1:pane-1",
						},
					},
				});
			},
			archive: (path) => {
				archivedPath = path;
			},
		});

		const currentEntry = await getSessionLocation("pane-1");
		expect(readCalls).toBe(0);
		expect(currentEntry).toMatchObject({
			cwd: "/tmp/current",
			agentSessionId: "session-current",
			pid: 123,
		});
		expect(archivedPath ?? "").toBe(LEGACY_SESSION_LOCATION_LOG_PATH);
	});
});
