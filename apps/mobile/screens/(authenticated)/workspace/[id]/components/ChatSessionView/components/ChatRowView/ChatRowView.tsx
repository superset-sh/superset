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
import { View } from "react-native";
import { MessageResponse } from "@/components/ai-elements/message";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Text } from "@/components/ui/text";
import type { ChatRow } from "../../utils/chatRows";
import { ApprovalCard } from "../ApprovalCard";
import { PlanCard } from "../PlanCard";
import { ToolCallItem } from "../ToolCallItem";
import { ToolRunItem } from "../ToolRunItem";
import { UserMessageBubble } from "../UserMessageBubble";

interface ChatRowViewProps {
	row: ChatRow;
	/** The streamed text for a message or thought, else its stored text. */
	text: string;
	harness: string | undefined;
	onRespond: (approvalId: string, decision: Decision) => Promise<void>;
	onRetryPrompt: (clientId: string) => void;
	onDiscardPrompt: (clientId: string) => void;
}

function sameRow(a: ChatRow, b: ChatRow): boolean {
	if (a.kind === "item" && b.kind === "item") return a.item === b.item;
	if (a.kind === "outbox" && b.kind === "outbox") return a.entry === b.entry;
	if (a.kind === "tool_run" && b.kind === "tool_run")
		return (
			a.items.length === b.items.length &&
			a.items.every((item, index) => item === b.items[index])
		);
	if (a.kind === "turn_status" && b.kind === "turn_status")
		return a.status === b.status && a.message === b.message;
	return a.kind === b.kind;
}

export const ChatRowView = memo(
	function ChatRowView({
		row,
		text,
		harness,
		onRespond,
		onRetryPrompt,
		onDiscardPrompt,
	}: ChatRowViewProps) {
		const { t } = useLingui();

		switch (row.kind) {
			case "working":
				return <Shimmer>{t({ message: "Working…" })}</Shimmer>;
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
					<Text className="text-muted-foreground text-xs">
						{row.status === "interrupted" ? (
							<Trans>Stopped</Trans>
						) : (
							(row.message ?? <Trans>The turn failed</Trans>)
						)}
					</Text>
				);
			case "tool_run":
				return <ToolRunItem items={row.items} />;
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
				return <MessageResponse>{text}</MessageResponse>;
			case "reasoning": {
				const streaming = item.completedAtMs === undefined;
				const duration =
					item.completedAtMs === undefined
						? undefined
						: Math.round((item.completedAtMs - item.startedAtMs) / 1000);
				return (
					<Reasoning duration={duration} isStreaming={streaming}>
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
					<View className="px-1">
						<Text
							className={
								notice.noticeKind === "error"
									? "text-destructive text-xs"
									: "text-muted-foreground text-xs"
							}
						>
							{notice.text}
						</Text>
					</View>
				);
			}
			default:
				return null;
		}
	},
	(prev, next) =>
		sameRow(prev.row, next.row) &&
		prev.text === next.text &&
		prev.harness === next.harness &&
		prev.onRespond === next.onRespond &&
		prev.onRetryPrompt === next.onRetryPrompt &&
		prev.onDiscardPrompt === next.onDiscardPrompt,
);
