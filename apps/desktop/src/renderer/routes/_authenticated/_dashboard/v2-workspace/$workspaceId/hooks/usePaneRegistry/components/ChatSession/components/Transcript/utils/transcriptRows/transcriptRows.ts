import {
	type OutboxEntry,
	type TurnGroup,
	toolRunKey,
	transcriptItemKey,
} from "@superset/chat/core";
import type {
	ApprovalRequest,
	Item,
	ToolCall,
	UserMessage,
} from "@superset/chat/protocol";
import type { PageLink, PageLinkFinder } from "../../../../utils/pageLinks";
import { turnPageLinks } from "../turnPageLinks";

export type TranscriptRow =
	| {
			kind: "working";
			key: string;
			groupStart: boolean;
			startedAtMs: number;
			completedAtMs: number | undefined;
	  }
	| {
			kind: "item";
			key: string;
			groupStart: boolean;
			item: Item;
			/** Pages to show as cards under a tool call. */
			pages?: readonly PageLink[];
			/** Slugs an agent message leaves to the earlier message that shows them. */
			pagesShownEarlier?: string;
			/** An approval whose target tool call is the row right above it. */
			afterTarget?: boolean;
	  }
	| { kind: "outbox"; key: string; groupStart: boolean; entry: OutboxEntry }
	| {
			kind: "tool_run";
			key: string;
			groupStart: boolean;
			items: ToolCall[];
			defaultCollapsed: boolean;
			/** Pages to show as cards under the run, so a collapsed run still shows them. */
			pages?: readonly PageLink[];
	  }
	| {
			kind: "turn_status";
			key: string;
			groupStart: boolean;
			status: "failed" | "interrupted";
			message: string | undefined;
	  };

export function transcriptRows(
	groups: readonly TurnGroup[],
	outbox: readonly OutboxEntry[],
	pendingApprovalTargets: ReadonlySet<string>,
	findPageLinks: PageLinkFinder,
	hiddenToolIds: ReadonlySet<string> = new Set(),
): TranscriptRow[] {
	const rows: TranscriptRow[] = [];
	const echoedClientIds = new Set<string>();

	for (const group of groups) {
		let groupStart = true;
		const push = (row: TranscriptRow) => {
			rows.push(row);
			groupStart = false;
		};
		const turn = group.turn;
		let clockPlaced = turn === null;
		const placeClock = () => {
			if (clockPlaced || !turn) return;
			clockPlaced = true;
			push({
				kind: "working",
				key: `working:${group.turnId}`,
				groupStart,
				startedAtMs: turn.startedAtMs,
				completedAtMs: turn.completedAtMs,
			});
		};
		const turnSettled = turn !== null && turn.status !== "running";
		const links = turnPageLinks(group.entries, turnSettled, findPageLinks);
		group.entries.forEach((entry, index) => {
			if (entry.kind !== "item" || entry.item.kind !== "user_message") {
				placeClock();
			}
			if (entry.kind === "item") {
				if (hiddenToolIds.has(entry.item.id)) return;
				const clientId =
					entry.item.kind === "user_message"
						? (entry.item as UserMessage).clientId
						: undefined;
				if (clientId) echoedClientIds.add(clientId);
				const pages = links.fromTools.get(entry.item.id);
				const pagesShownEarlier = links.shownEarlier.get(entry.item.id);
				const targetId =
					entry.item.kind === "approval_request"
						? (entry.item as ApprovalRequest).targetItemId
						: null;
				const above = groupStart ? undefined : rows.at(-1);
				const afterTarget =
					targetId !== null &&
					((above?.kind === "item" && above.item.id === targetId) ||
						(above?.kind === "tool_run" &&
							above.items.at(-1)?.id === targetId));
				push({
					kind: "item",
					key: transcriptItemKey(entry.item),
					groupStart,
					item: entry.item,
					...(pages ? { pages } : {}),
					...(pagesShownEarlier ? { pagesShownEarlier } : {}),
					...(afterTarget ? { afterTarget } : {}),
				});
				return;
			}
			const items = entry.items.filter((tool) => !hiddenToolIds.has(tool.id));
			if (items.length === 0) return;
			const pages = items.flatMap((tool) => links.fromTools.get(tool.id) ?? []);
			push({
				kind: "tool_run",
				key: toolRunKey(group.turnId, entry.items, index),
				groupStart,
				items,
				defaultCollapsed:
					(turnSettled ||
						(index < group.entries.length - 1 &&
							!items.some((tool) => tool.status === "running"))) &&
					!items.some((tool) => pendingApprovalTargets.has(tool.id)),
				...(pages.length > 0 ? { pages } : {}),
			});
		});
		placeClock();
		if (turn?.status === "failed" || turn?.status === "interrupted") {
			push({
				kind: "turn_status",
				key: `status:${group.turnId}`,
				groupStart,
				status: turn.status,
				message: turn.error?.message,
			});
		}
	}

	for (const entry of outbox) {
		if (echoedClientIds.has(entry.clientId)) continue;
		rows.push({ kind: "outbox", key: entry.clientId, groupStart: true, entry });
	}
	return rows;
}
