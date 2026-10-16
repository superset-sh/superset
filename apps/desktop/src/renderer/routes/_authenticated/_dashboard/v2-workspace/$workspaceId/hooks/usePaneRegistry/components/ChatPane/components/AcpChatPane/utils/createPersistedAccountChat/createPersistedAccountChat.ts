import {
	type CreateAccountSessionInput,
	createAccountSessionInputSchema,
} from "@superset/chat/protocol";
import { z } from "zod";

const launchSchema = z.strictObject({
	hostUrl: z.string().min(1),
	request: createAccountSessionInputSchema,
});

export type AccountChatLaunch = z.infer<typeof launchSchema>;

// The existing org collection shares Chromium's bounded localStorage quota.
const MAX_LAYOUT_CHARACTERS = 16 * 1024 * 1024;
export class AccountChatPersistenceError extends Error {
	constructor() {
		super("Account chat persistence could not be verified");
		this.name = "AccountChatPersistenceError";
	}
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function containsPane(node: unknown, paneId: string, depth = 0): boolean {
	if (depth > 64) return false;
	const value = record(node);
	if (value?.type === "pane") return value.paneId === paneId;
	return (
		value?.type === "split" &&
		(containsPane(value.first, paneId, depth + 1) ||
			containsPane(value.second, paneId, depth + 1))
	);
}

function sameLaunch(
	left: AccountChatLaunch,
	right: AccountChatLaunch,
): boolean {
	return (
		left.hostUrl === right.hostUrl &&
		left.request.commandId === right.request.commandId &&
		left.request.workspaceId === right.request.workspaceId &&
		left.request.harness === right.request.harness &&
		left.request.account.selection === right.request.account.selection &&
		left.request.account.identity === right.request.account.identity &&
		left.request.modeId === right.request.modeId &&
		left.request.modelId === right.request.modelId
	);
}

/**
 * Read the real backing storage, not the optimistic collection: its quota guard
 * intentionally permits in-memory writes after a failed localStorage write.
 * No new key or retry command is created, and no provider is closed on failure.
 */
export async function createPersistedAccountChat<Result>({
	storage,
	organizationId,
	hostUrl,
	workspaceId,
	terminalId,
	launch,
	create,
}: {
	storage: Pick<Storage, "getItem">;
	organizationId: string;
	hostUrl: string;
	workspaceId: string;
	terminalId: string;
	launch: AccountChatLaunch;
	create: (request: CreateAccountSessionInput) => Promise<Result>;
}): Promise<Result> {
	let captured: AccountChatLaunch;
	try {
		captured = launchSchema.parse(launch);
		if (
			!organizationId ||
			!terminalId ||
			captured.hostUrl !== hostUrl ||
			captured.request.workspaceId !== workspaceId
		)
			throw new AccountChatPersistenceError();
		const serialized = storage.getItem(
			`v2-workspace-local-state-${organizationId}`,
		);
		if (!serialized || serialized.length > MAX_LAYOUT_CHARACTERS)
			throw new AccountChatPersistenceError();
		const collection = record(JSON.parse(serialized));
		if (!collection) throw new AccountChatPersistenceError();
		// TanStack's localStorage adapter stores encoded-key -> {versionKey,data}.
		const rows = Object.values(collection)
			.map((entry) => record(record(entry)?.data))
			.filter((row) => row?.workspaceId === workspaceId);
		if (rows.length !== 1) throw new AccountChatPersistenceError();
		let matches = 0;
		for (const slot of ["paneLayout", "rightPaneLayout"]) {
			const layout = record(rows[0]?.[slot]);
			if (layout?.version !== 1 || !Array.isArray(layout.tabs)) continue;
			for (const rawTab of layout.tabs) {
				const tab = record(rawTab);
				const panes = record(tab?.panes);
				if (!panes) continue;
				for (const rawPane of Object.values(panes)) {
					const pane = record(rawPane);
					const data = record(pane?.data);
					if (
						pane?.kind !== "chat-v3" ||
						typeof pane.id !== "string" ||
						!containsPane(tab?.layout, pane.id) ||
						data?.terminalId !== terminalId
					)
						continue;
					const saved = launchSchema.safeParse(data.accountLaunch);
					if (
						data.sessionId !== null ||
						data.accountBound !== true ||
						data.accountDraftId !== captured.request.commandId ||
						record(data.agent)?.id !==
							captured.request.harness.replace(/-acp$/, "") ||
						!saved.success ||
						!sameLaunch(captured, saved.data)
					)
						throw new AccountChatPersistenceError();
					matches++;
				}
			}
		}
		if (matches !== 1) throw new AccountChatPersistenceError();
	} catch {
		// Storage exceptions can contain unrelated persisted data. Do not surface it.
		throw new AccountChatPersistenceError();
	}
	return create(captured.request);
}
