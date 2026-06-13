import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	getSessionLocation,
	LEGACY_SESSION_LOCATION_LOG_PATH,
	markSessionLocationExited,
	type SessionLocationEntry,
	type SessionLocationStoreAdapter,
	setHostDbAccessForTests,
	setLegacySessionLocationSourceForTests,
	setSessionLocationStoreAdapterForTests,
	updateSessionLocationAgentIdentity,
	upsertSessionLocation,
} from "./session-location-log";

describe("session-location-log", () => {
	let store = new Map<string, SessionLocationEntry>();

	const adapter: SessionLocationStoreAdapter = {
		isAvailable: () => true,
		getByPaneId: (paneId) => store.get(paneId),
		upsert: (entry) => {
			store.set(entry.paneId, {
				...entry,
				workspaceName: entry.workspaceName,
				workspacePath: entry.workspacePath,
				rootPath: entry.rootPath,
				command: entry.command,
				agentId: entry.agentId,
				agentSessionId: entry.agentSessionId,
				exitedAt: entry.exitedAt,
				exitReason: entry.exitReason,
			});
		},
		update: (paneId, patch) => {
			const entry = store.get(paneId);
			if (!entry) return;
			store.set(paneId, {
				...entry,
				...(Object.hasOwn(patch, "agentId")
					? { agentId: patch.agentId ?? undefined }
					: {}),
				...(Object.hasOwn(patch, "agentSessionId")
					? { agentSessionId: patch.agentSessionId ?? undefined }
					: {}),
				...(Object.hasOwn(patch, "status") && patch.status
					? { status: patch.status }
					: {}),
				...(Object.hasOwn(patch, "pid") ? { pid: patch.pid ?? null } : {}),
				...(Object.hasOwn(patch, "updatedAt") && patch.updatedAt !== undefined
					? { updatedAt: patch.updatedAt }
					: {}),
				...(Object.hasOwn(patch, "exitedAt")
					? { exitedAt: patch.exitedAt ?? undefined }
					: {}),
				...(Object.hasOwn(patch, "exitReason")
					? { exitReason: patch.exitReason ?? undefined }
					: {}),
			});
		},
	};

	beforeEach(() => {
		store = new Map();
		setHostDbAccessForTests({
			getActiveHostDb: () => null,
			getActiveHostDbPath: () =>
				"/tmp/superset-test/host/organization-1/host.db",
		});
		setLegacySessionLocationSourceForTests({
			exists: () => false,
			read: () => "",
			archive: () => {},
		});
		setSessionLocationStoreAdapterForTests(adapter);
	});

	afterEach(() => {
		setHostDbAccessForTests(null);
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
		expect(readCalls).toBe(1);
		expect(currentEntry).toMatchObject({
			cwd: "/tmp/current",
			agentSessionId: "session-current",
			pid: 123,
		});
		expect(archivedPath ?? "").toBe(LEGACY_SESSION_LOCATION_LOG_PATH);
	});

	it("finishes a partially imported legacy log without overwriting existing rows", async () => {
		let archivedPath: string | null = null;

		upsertSessionLocation({
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "workspace-1",
			cwd: "/tmp/current",
			pid: 123,
		});

		setLegacySessionLocationSourceForTests({
			exists: () => true,
			read: () =>
				JSON.stringify({
					sessions: {
						"pane-1": {
							paneId: "pane-1",
							tabId: "tab-1",
							workspaceId: "workspace-1",
							cwd: "/tmp/stale",
							pid: 999,
							status: "available",
							createdAt: 1,
							updatedAt: 2,
							locationKey: "workspace-1:tab-1:pane-1",
						},
						"pane-2": {
							paneId: "pane-2",
							tabId: "tab-2",
							workspaceId: "workspace-1",
							cwd: "/tmp/imported",
							pid: 456,
							agentId: "codex",
							agentSessionId: "session-imported",
							status: "available",
							createdAt: 3,
							updatedAt: 4,
							locationKey: "workspace-1:tab-2:pane-2",
						},
					},
				}),
			archive: (path) => {
				archivedPath = path;
			},
		});

		const importedEntry = await getSessionLocation("pane-2");
		expect(importedEntry).toMatchObject({
			paneId: "pane-2",
			cwd: "/tmp/imported",
			agentId: "codex",
			agentSessionId: "session-imported",
		});
		expect(store.get("pane-1")).toMatchObject({
			cwd: "/tmp/current",
			pid: 123,
		});
		expect(archivedPath ?? "").toBe(LEGACY_SESSION_LOCATION_LOG_PATH);
	});
});
