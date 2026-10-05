import type { OutboxEntry, SessionSnapshot } from "@superset/chat/core";
import { displayText } from "@superset/chat/core";
import type { Decision, UserMessage } from "@superset/chat/protocol";
import type { ChatForkTarget } from "../../../../types";
import type { TranscriptRow } from "../../utils/transcriptRows";
import { ItemRow } from "./components/ItemRow";
import { ToolRunRow } from "./components/ToolRunRow";
import { TurnStatusRow } from "./components/TurnStatusRow";
import { WorkingFor } from "./components/WorkingFor";

function outboxMessage(entry: OutboxEntry): UserMessage {
	return {
		id: entry.clientId,
		kind: "user_message",
		clientId: entry.clientId,
		startedAtMs: 0,
		content: entry.content,
	};
}

export type TurnGroupSectionProps = {
	row: TranscriptRow;
	lastReply: boolean;
	snapshot: SessionSnapshot;
	isEntryCollapsed: (entryKey: string, defaultCollapsed: boolean) => boolean;
	onToggleEntry: (entryKey: string, collapsed: boolean) => void;
	onRespond: (approvalId: string, decision: Decision) => void;
	onRetryPrompt: (clientId: string) => void;
	onDiscardPrompt: (clientId: string) => void;
	onFork?: ((target: ChatForkTarget) => void) | undefined;
	canForkToWorktree?: boolean;
};

/**
 * One row of a turn group: the turn's working line, a message, a run of tool
 * calls, or how the turn ended. The transcript renders the rows of every
 * group as one flat list, so a message keeps its DOM node from sending
 * through its turn.
 */
export function TurnGroupSection({
	canForkToWorktree,
	lastReply,
	isEntryCollapsed,
	onDiscardPrompt,
	onFork,
	onRespond,
	onRetryPrompt,
	onToggleEntry,
	row,
	snapshot,
}: TurnGroupSectionProps) {
	const harness = snapshot.session?.harness;
	switch (row.kind) {
		case "working":
			return (
				<WorkingFor
					completedAtMs={row.completedAtMs}
					startedAtMs={row.startedAtMs}
				/>
			);
		case "item":
			return (
				<ItemRow
					canForkToWorktree={canForkToWorktree}
					lastReply={lastReply}
					harness={harness}
					item={row.item}
					onFork={onFork}
					onRespond={onRespond}
					text={displayText(snapshot, row.item.id)}
				/>
			);
		case "outbox":
			return (
				<ItemRow
					harness={harness}
					item={outboxMessage(row.entry)}
					onRespond={onRespond}
					pending={{
						failed: row.entry.state === "failed",
						onRetry: () => onRetryPrompt(row.entry.clientId),
						onDiscard: () => onDiscardPrompt(row.entry.clientId),
					}}
					text=""
				/>
			);
		case "tool_run":
			return (
				<ToolRunRow
					collapsed={isEntryCollapsed(row.key, row.defaultCollapsed)}
					items={row.items}
					onToggle={onToggleEntry}
					rowKey={row.key}
				/>
			);
		case "turn_status":
			return <TurnStatusRow message={row.message} status={row.status} />;
	}
}
