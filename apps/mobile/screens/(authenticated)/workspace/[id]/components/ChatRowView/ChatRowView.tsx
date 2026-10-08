import { Trans, useLingui } from "@lingui/react/macro";
import type {
	ApprovalRequest,
	Decision,
	Notice,
	Plan,
	Reasoning as ReasoningItem,
	ToolCall,
	UserMessage,
} from "@superset/chat/protocol";
import { memo } from "react";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { ChatRow } from "../../utils/chatRows";
import { ActivityRow } from "./components/ActivityRow";
import { AgentMessage } from "./components/AgentMessage";
import { ApprovalCard } from "./components/ApprovalCard";
import { PlanCard } from "./components/PlanCard";
import { SystemLine } from "./components/SystemLine";
import { ToolCallItem } from "./components/ToolCallItem";
import { ToolRunItem } from "./components/ToolRunItem";
import { UserMessageBubble } from "./components/UserMessageBubble";

interface ChatRowViewProps {
	row: ChatRow;
	isLastReply: boolean;
	/** The streamed text for a message or thought, else its stored text. */
	text: string;
	harness: string | undefined;
	onRespond: (approvalId: string, decision: Decision) => Promise<void>;
	onRetryPrompt: (clientId: string) => void;
	onDiscardPrompt: (clientId: string) => void;
	onLongPressMessage: (itemId: string) => void;
	onOpenActivity: (key: string) => void;
}

function sameRow(a: ChatRow, b: ChatRow): boolean {
	if (a.kind === "item" && b.kind === "item") return a.item === b.item;
	if (a.kind === "outbox" && b.kind === "outbox") return a.entry === b.entry;
	if (a.kind === "tool_run" && b.kind === "tool_run")
		return (
			a.items.length === b.items.length &&
			a.items.every((item, index) => item === b.items[index])
		);
	if (a.kind === "activity" && b.kind === "activity")
		return (
			a.rows.length === b.rows.length &&
			a.rows.every((row, index) => {
				const other = b.rows[index];
				return other !== undefined && sameRow(row, other);
			})
		);
	if (a.kind === "turn_status" && b.kind === "turn_status")
		return a.status === b.status && a.message === b.message;
	return a.kind === b.kind;
}

export const ChatRowView = memo(
	function ChatRowView({
		row,
		isLastReply,
		text,
		harness,
		onRespond,
		onRetryPrompt,
		onDiscardPrompt,
		onLongPressMessage,
		onOpenActivity,
	}: ChatRowViewProps) {
		const { t } = useLingui();

		switch (row.kind) {
			case "working":
				return (
					<Shimmer className="text-[17px]">
						{t({ message: "Working…" })}
					</Shimmer>
				);
			case "outbox":
				return (
					<UserMessageBubble
						content={row.entry.content}
						harness={harness}
						pending={{
							failed: row.entry.state === "failed",
							onRetry: () => onRetryPrompt(row.entry.clientId),
							onDiscard: () => onDiscardPrompt(row.entry.clientId),
						}}
					/>
				);
			case "turn_status":
				return (
					<SystemLine tone={row.status === "failed" ? "error" : "muted"}>
						{row.status === "interrupted" ? (
							<Trans>Stopped</Trans>
						) : (
							(row.message ?? <Trans>The turn failed</Trans>)
						)}
					</SystemLine>
				);
			case "tool_run":
				return <ToolRunItem items={row.items} />;
			case "activity":
				return (
					<ActivityRow
						onPress={() => onOpenActivity(row.key)}
						rows={row.rows}
					/>
				);
			case "item":
				break;
		}

		const item = row.item;
		switch (item.kind) {
			case "user_message":
				return (
					<UserMessageBubble
						content={(item as UserMessage).content}
						harness={harness}
					/>
				);
			case "agent_message":
				return (
					<AgentMessage
						onBranch={() => onLongPressMessage(item.id)}
						showActions={isLastReply && item.completedAtMs !== undefined}
						text={text}
					/>
				);
			case "reasoning": {
				const streaming = item.completedAtMs === undefined;
				const duration =
					item.completedAtMs === undefined
						? undefined
						: Math.round((item.completedAtMs - item.startedAtMs) / 1000);
				return (
					<Reasoning
						className="mb-0 w-full"
						duration={duration}
						isStreaming={streaming}
					>
						<ReasoningTrigger />
						<ReasoningContent>
							{text || ((item as ReasoningItem).summary ?? "")}
						</ReasoningContent>
					</Reasoning>
				);
			}
			case "tool_call":
				return <ToolCallItem item={item as ToolCall} />;
			case "plan":
				return <PlanCard plan={item as Plan} />;
			case "approval_request":
				return (
					<ApprovalCard
						approval={item as ApprovalRequest}
						onRespond={onRespond}
					/>
				);
			case "notice": {
				const notice = item as Notice;
				if (!notice.text) return null;
				return (
					<SystemLine tone={notice.noticeKind === "error" ? "error" : "muted"}>
						{notice.text}
					</SystemLine>
				);
			}
			default:
				return null;
		}
	},
	(prev, next) =>
		sameRow(prev.row, next.row) &&
		prev.isLastReply === next.isLastReply &&
		prev.text === next.text &&
		prev.harness === next.harness &&
		prev.onRespond === next.onRespond &&
		prev.onRetryPrompt === next.onRetryPrompt &&
		prev.onDiscardPrompt === next.onDiscardPrompt &&
		prev.onLongPressMessage === next.onLongPressMessage &&
		prev.onOpenActivity === next.onOpenActivity,
);
