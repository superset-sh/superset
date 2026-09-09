import { Plural, Trans } from "@lingui/react/macro";
import type { SessionSnapshot, TurnGroup } from "@superset/chat/core";
import type { Decision, Item } from "@superset/chat/protocol";
import { isKnownItem } from "@superset/chat/protocol";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { rowKindForItem } from "../../utils/rowKind";
import { AgentMessageRow } from "../AgentMessageRow";
import { ApprovalRow } from "../ApprovalRow";
import { NoticeRow } from "../NoticeRow";
import { PlanRow } from "../PlanRow";
import { ReasoningRow } from "../ReasoningRow";
import { ToolCallRow } from "../ToolCallRow";
import { UnknownItemRow } from "../UnknownItemRow";
import { UserMessageRow } from "../UserMessageRow";

const OFFSCREEN_CLASSNAME =
	"[content-visibility:auto] [contain-intrinsic-size:auto_240px]";

export type TurnGroupSectionProps = {
	group: TurnGroup;
	snapshot: SessionSnapshot;
	pendingApprovalTargets: ReadonlySet<string>;
	isEntryCollapsed: (entryKey: string, defaultCollapsed: boolean) => boolean;
	onToggleEntry: (entryKey: string, collapsed: boolean) => void;
	onRespond: (approvalId: string, decision: Decision) => void;
};

function ItemRow({
	item,
	onRespond,
	snapshot,
}: {
	item: Item;
	snapshot: SessionSnapshot;
	onRespond: TurnGroupSectionProps["onRespond"];
}) {
	if (rowKindForItem(item) === "unknown" || !isKnownItem(item)) {
		return <UnknownItemRow item={item} />;
	}
	switch (item.kind) {
		case "user_message":
			return <UserMessageRow item={item} />;
		case "agent_message":
			return <AgentMessageRow item={item} snapshot={snapshot} />;
		case "reasoning":
			return <ReasoningRow item={item} snapshot={snapshot} />;
		case "tool_call":
			return <ToolCallRow item={item} />;
		case "plan":
			return <PlanRow item={item} />;
		case "approval_request":
			return <ApprovalRow item={item} onRespond={onRespond} />;
		case "notice":
			return <NoticeRow item={item} />;
	}
}

export function TurnGroupSection({
	group,
	isEntryCollapsed,
	onToggleEntry,
	onRespond,
	pendingApprovalTargets,
	snapshot,
}: TurnGroupSectionProps) {
	const turnSettled = group.turn !== null && group.turn.status !== "running";
	return (
		<div className="flex flex-col gap-2">
			{group.entries.map((entry, index) => {
				if (entry.kind === "item") {
					return (
						<div
							className={OFFSCREEN_CLASSNAME}
							data-item-id={entry.item.id}
							key={entry.item.id}
						>
							<ItemRow
								item={entry.item}
								onRespond={onRespond}
								snapshot={snapshot}
							/>
						</div>
					);
				}

				const entryKey = `${group.turnId}:${index}`;
				const containsApprovalTarget = entry.items.some((tool) =>
					pendingApprovalTargets.has(tool.id),
				);
				const collapsed = isEntryCollapsed(
					entryKey,
					turnSettled && !containsApprovalTarget,
				);
				return (
					<div
						className={OFFSCREEN_CLASSNAME}
						data-item-id={entry.items[0]?.id}
						key={entryKey}
					>
						<Collapsible
							onOpenChange={(open) => onToggleEntry(entryKey, !open)}
							open={!collapsed}
						>
							<CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
								<ChevronRight
									className={
										collapsed
											? "size-3 transition-transform"
											: "size-3 rotate-90 transition-transform"
									}
								/>
								<Plural
									value={entry.items.length}
									one="# tool call"
									other="# tool calls"
								/>
							</CollapsibleTrigger>
							<CollapsibleContent className="flex flex-col gap-2 pt-1">
								{entry.items.map((tool) => (
									<ToolCallRow item={tool} key={tool.id} />
								))}
							</CollapsibleContent>
						</Collapsible>
					</div>
				);
			})}
			{group.turn?.status === "failed" && (
				<div className="text-xs text-destructive">
					<Trans>
						Turn failed
						{group.turn.error ? `: ${group.turn.error.message}` : ""}
					</Trans>
				</div>
			)}
			{group.turn?.status === "interrupted" && (
				<div className="text-xs text-muted-foreground">
					<Trans>Interrupted</Trans>
				</div>
			)}
		</div>
	);
}
