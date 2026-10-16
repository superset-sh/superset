import { afterEach, describe, expect, it, mock } from "bun:test";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import { withQuotaGuard } from "renderer/routes/_authenticated/providers/CollectionsProvider/withQuotaGuard";
import { z } from "zod";
import {
	type AccountChatLaunch,
	createPersistedAccountChat,
} from "./createPersistedAccountChat";

const commandId = "853b773c-5e5b-47a2-a239-7e4304ae3367";
const hostUrl = "http://test-host.invalid";
const workspaceId = "workspace-test";
const organizationId = "organization-test";
const terminalId = "placeholder-terminal";
const storageKey = `v2-workspace-local-state-${organizationId}`;
const launch: AccountChatLaunch = {
	hostUrl,
	request: {
		commandId,
		workspaceId,
		harness: "claude-acp",
		account: { selection: "fixture", identity: "a".repeat(64) },
		modeId: "default",
		modelId: "fixture-model",
	},
};
const result = { sessionId: "saved-session", terminalId: "server-terminal" };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

function paneData() {
	return {
		terminalId,
		sessionId: null as string | null,
		agent: { id: "claude" },
		accountBound: true,
		accountDraftId: commandId,
		accountLaunch: structuredClone(launch),
	};
}

function fixture() {
	const values = new Map<string, string>();
	let full = false;
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			if (full) {
				const error = new Error("quota reached");
				error.name = "QuotaExceededError";
				throw error;
			}
			values.set(key, value);
		},
		removeItem: (key: string) => values.delete(key),
	};
	const row = {
		workspaceId,
		paneLayout: {
			version: 1,
			tabs: [
				{
					id: "tab",
					createdAt: 1,
					activePaneId: "pane",
					layout: { type: "pane", paneId: "pane" },
					panes: { pane: { id: "pane", kind: "chat-v3", data: paneData() } },
				},
			],
			activeTabId: "tab",
		},
	};
	const collection = createCollection(
		localStorageCollectionOptions(
			withQuotaGuard(
				{
					id: crypto.randomUUID(),
					storageKey,
					storage,
					schema: z.object({
						workspaceId: z.string(),
						paneLayout: z.unknown(),
					}),
					getKey: (item: { workspaceId: string }) => item.workspaceId,
					storageEventApi: { addEventListener() {}, removeEventListener() {} },
					startSync: true,
					gcTime: 0,
				},
				{ storage, reclaim: () => 0, onPersistFailed() {} },
			),
		),
	);
	cleanups.push(() => collection.cleanup());
	const tab = row.paneLayout.tabs[0];
	if (!tab) throw new Error("Missing test tab");
	return {
		storage,
		values,
		row,
		tab,
		collection,
		fill: () => {
			full = true;
		},
		free: () => {
			full = false;
		},
	};
}

function run(
	storage: Pick<Storage, "getItem">,
	create: (
		request: AccountChatLaunch["request"],
	) => Promise<typeof result> = mock(async () => result),
	options: Partial<Parameters<typeof createPersistedAccountChat>[0]> = {},
) {
	return createPersistedAccountChat({
		storage,
		organizationId,
		hostUrl,
		workspaceId,
		terminalId,
		launch,
		create,
		...options,
	});
}

describe("account chat durable create boundary", () => {
	it("accepts the actual TanStack persisted pane format and exact request", async () => {
		const f = fixture();
		f.collection.insert(f.row);
		const create = mock(async () => result);
		expect(await run(f.storage, create)).toEqual(result);
		expect(create).toHaveBeenCalledTimes(1);
		expect(create).toHaveBeenCalledWith(launch.request);
	});

	it("refuses a quota-dropped optimistic pane before any provider request", async () => {
		const f = fixture();
		f.fill();
		f.collection.insert(f.row);
		expect(f.collection.get(workspaceId)).toBeDefined();
		expect(f.storage.getItem(storageKey)).toBeNull();
		const create = mock(async () => result);
		await expect(run(f.storage, create)).rejects.toThrow(
			"persistence could not be verified",
		);
		expect(create).not.toHaveBeenCalled();
	});

	it("refuses an old persisted selection when only the optimistic row changed", async () => {
		const f = fixture();
		f.tab.panes.pane.data.accountLaunch.request.account.identity = "b".repeat(
			64,
		);
		f.collection.insert(f.row);
		f.fill();
		f.collection.update(workspaceId, (draft) => {
			draft.paneLayout = {
				...f.row.paneLayout,
				tabs: [
					{
						...f.tab,
						panes: { pane: { id: "pane", kind: "chat-v3", data: paneData() } },
					},
				],
			};
		});
		const create = mock(async () => result);
		await expect(run(f.storage, create)).rejects.toThrow(
			"persistence could not be verified",
		);
		expect(create).not.toHaveBeenCalled();
	});

	it("allows the same command after space is freed and a tab rename saves the layout", async () => {
		const f = fixture();
		f.fill();
		f.collection.insert(f.row);
		const create = mock(async () => result);
		await expect(run(f.storage, create)).rejects.toThrow(
			"persistence could not be verified",
		);
		f.free();
		// Freeing space alone does not rewrite the optimistic collection.
		await expect(run(f.storage, create)).rejects.toThrow(
			"persistence could not be verified",
		);
		f.collection.update(workspaceId, (draft) => {
			draft.paneLayout = {
				...f.row.paneLayout,
				tabs: [{ ...f.tab, titleOverride: "Saved account chat" }],
			};
		});
		expect(await run(f.storage, create)).toEqual(result);
		expect(create).toHaveBeenCalledTimes(1);
		expect(create).toHaveBeenCalledWith(launch.request);
	});

	it.each([
		"host",
		"workspace",
		"account",
		"command",
		"model",
		"mode",
		"harness",
	])("refuses changed %s context without calling create", async (field) => {
		const f = fixture();
		const saved = f.tab.panes.pane.data.accountLaunch;
		if (field === "host") saved.hostUrl = "http://other-host.invalid";
		if (field === "workspace") saved.request.workspaceId = "other-workspace";
		if (field === "account") saved.request.account.selection = "other";
		if (field === "command") saved.request.commandId = crypto.randomUUID();
		if (field === "model") saved.request.modelId = "other-model";
		if (field === "mode") saved.request.modeId = "other-mode";
		if (field === "harness") saved.request.harness = "codex-acp";
		f.collection.insert(f.row);
		const create = mock(async () => result);
		await expect(run(f.storage, create)).rejects.toThrow(
			"persistence could not be verified",
		);
		expect(create).not.toHaveBeenCalled();
	});

	it("rejects a request routed to a different current host or workspace", async () => {
		const f = fixture();
		f.collection.insert(f.row);
		const create = mock(async () => result);
		await expect(
			run(f.storage, create, { hostUrl: "other-host" }),
		).rejects.toThrow();
		await expect(
			run(f.storage, create, { workspaceId: "other-workspace" }),
		).rejects.toThrow();
		expect(create).not.toHaveBeenCalled();
	});

	it("does not launch on read errors, malformed data or missing rows", async () => {
		const f = fixture();
		const create = mock(async () => result);
		await expect(
			run(
				{
					getItem() {
						throw new Error("unrelated private data");
					},
				},
				create,
			),
		).rejects.toThrow("persistence could not be verified");
		f.values.set(storageKey, "broken json");
		await expect(run(f.storage, create)).rejects.toThrow(
			"persistence could not be verified",
		);
		f.values.set(storageKey, "{}");
		await expect(run(f.storage, create)).rejects.toThrow(
			"persistence could not be verified",
		);
		expect(create).not.toHaveBeenCalled();
	});

	it.each([
		"bound",
		"draft",
		"adopted",
		"unreachable",
		"duplicate",
	])("refuses a %s pane that cannot safely own this create", async (field) => {
		const f = fixture();
		const tab = f.tab;
		if (field === "bound") tab.panes.pane.data.accountBound = false;
		if (field === "draft")
			tab.panes.pane.data.accountDraftId = "different-draft";
		if (field === "adopted") tab.panes.pane.data.sessionId = "existing-session";
		if (field === "unreachable") tab.layout.paneId = "different-pane";
		if (field === "duplicate") f.row.paneLayout.tabs.push(structuredClone(tab));
		f.collection.insert(f.row);
		const create = mock(async () => result);
		await expect(run(f.storage, create)).rejects.toThrow(
			"persistence could not be verified",
		);
		expect(create).not.toHaveBeenCalled();
	});

	it("retries a lost response with the same durable command and immutable payload", async () => {
		const f = fixture();
		f.collection.insert(f.row);
		const receipts = new Map<string, typeof result>();
		const payloads: unknown[] = [];
		let launches = 0;
		let loseResponse = true;
		const create = mock(async (request: AccountChatLaunch["request"]) => {
			payloads.push(request);
			if (!receipts.has(request.commandId)) {
				launches++;
				receipts.set(request.commandId, result);
			}
			if (loseResponse) {
				loseResponse = false;
				throw new Error("response lost");
			}
			const receipt = receipts.get(request.commandId);
			if (!receipt) throw new Error("Missing test receipt");
			return receipt;
		});
		await expect(run(f.storage, create)).rejects.toThrow("response lost");
		expect(await run(f.storage, create)).toEqual(result);
		expect(payloads).toEqual([launch.request, launch.request]);
		expect(payloads[0]).not.toBe(launch.request);
		expect(launches).toBe(1);
	});
});
