import type { Decision, Item } from "@superset/chat/protocol";
import { isKnownItem } from "@superset/chat/protocol";
import { memo } from "react";
import type { ChatForkTarget } from "../../../../../../types";
import { rowKindForItem } from "../../../../utils/rowKind";
import { AgentMessageRow } from "../../../AgentMessageRow";
import { ApprovalRow } from "../../../ApprovalRow";
import { NoticeRow } from "../../../NoticeRow";
import { PlanRow } from "../../../PlanRow";
import { ReasoningRow } from "../../../ReasoningRow";
import { ToolCallRow } from "../../../ToolCallRow";
import { UnknownItemRow } from "../../../UnknownItemRow";
import { type PendingPrompt, UserMessageRow } from "../../../UserMessageRow";

export type ItemRowProps = {
	item: Item;
	text: string;
	harness: string | undefined;
	pending?: PendingPrompt | undefined;
	onRespond: (approvalId: string, decision: Decision) => void;
	onFork?: ((target: ChatForkTarget) => void) | undefined;
	canForkToWorktree?: boolean;
	lastReply?: boolean;
	pagesShownEarlier?: string | undefined;
};

export const ItemRow = memo(function ItemRow({
	canForkToWorktree,
	lastReply = false,
	harness,
	item,
	onFork,
	onRespond,
	pagesShownEarlier,
	pending,
	text,
}: ItemRowProps) {
	if (rowKindForItem(item) === "unknown" || !isKnownItem(item)) {
		return <UnknownItemRow item={item} />;
	}
	switch (item.kind) {
		case "user_message":
			return <UserMessageRow harness={harness} item={item} pending={pending} />;
		case "agent_message":
			return (
				<AgentMessageRow
					canForkToWorktree={canForkToWorktree}
					lastReply={lastReply}
					item={item}
					onFork={onFork}
					pagesShownEarlier={pagesShownEarlier}
					text={text}
				/>
			);
		case "reasoning":
			return <ReasoningRow item={item} text={text} />;
		case "tool_call":
			return <ToolCallRow item={item} />;
		case "plan":
			return <PlanRow item={item} />;
		case "approval_request":
			return <ApprovalRow item={item} onRespond={onRespond} />;
		case "notice":
			return <NoticeRow item={item} />;
	}
});
