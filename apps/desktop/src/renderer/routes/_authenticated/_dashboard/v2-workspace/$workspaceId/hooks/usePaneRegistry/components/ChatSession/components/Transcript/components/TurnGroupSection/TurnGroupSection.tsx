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
import type { ChatForkTarget } from "../../../../types";
import { rowKindForItem } from "../../utils/rowKind";
import { AgentMessageRow } from "../AgentMessageRow";
import { ApprovalRow } from "../ApprovalRow";
import { NoticeRow } from "../NoticeRow";
import { PlanRow } from "../PlanRow";
import { ReasoningRow } from "../ReasoningRow";
import { ToolCallRow } from "../ToolCallRow";
import { UnknownItemRow } from "../UnknownItemRow";
import { UserMessageRow } from "../UserMessageRow";
import { WorkingFor } from "../WorkingFor";

const OFFSCREEN_CLASSNAME =
	"[content-visibility:auto] [contain-intrinsic-size:auto_240px]";

export type TurnGroupSectionProps = {
	group: TurnGroup;
	snapshot: SessionSnapshot;
	pendingApprovalTargets: ReadonlySet<string>;
	isEntryCollapsed: (entryKey: string, defaultCollapsed: boolean) => boolean;
	onToggleEntry: (entryKey: string, collapsed: boolean) => void;
	onRespond: (approvalId: string, decision: Decision) => void;
	/** Absent when the agent cannot branch its own session. */
	onFork?: ((target: ChatForkTarget) => void) | undefined;
	canForkToWorktree?: boolean;
};

function ItemRow({
	canForkToWorktree,
	item,
	onFork,
	onRespond,
	snapshot,
}: {
	item: Item;
	snapshot: SessionSnapshot;
	onRespond: TurnGroupSectionProps["onRespond"];
	onFork: TurnGroupSectionProps["onFork"];
	canForkToWorktree: TurnGroupSectionProps["canForkToWorktree"];
}) {
	if (rowKindForItem(item) === "unknown" || !isKnownItem(item)) {
		return <UnknownItemRow item={item} />;
	}
	switch (item.kind) {
		case "user_message":
			return <UserMessageRow harness={snapshot.session?.harness} item={item} />;
		case "agent_message":
			return (
				<AgentMessageRow
					canForkToWorktree={canForkToWorktree}
					item={item}
					onFork={onFork}
					snapshot={snapshot}
				/>
			);
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
	canForkToWorktree,
	group,
	isEntryCollapsed,
	onToggleEntry,
	onFork,
	onRespond,
	pendingApprovalTargets,
	snapshot,
}: TurnGroupSectionProps) {
	const turnSettled = group.turn !== null && group.turn.status !== "running";
	return (
		<div className="flex flex-col gap-4">
			{group.turn && (
				<WorkingFor
					completedAtMs={group.turn.completedAtMs}
					startedAtMs={group.turn.startedAtMs}
				/>
			)}
			{group.entries.map((entry, index) => {
				if (entry.kind === "item") {
					return (
						<div
							className={OFFSCREEN_CLASSNAME}
							data-item-id={entry.item.id}
							key={entry.item.id}
						>
							<ItemRow
								canForkToWorktree={canForkToWorktree}
								item={entry.item}
								onFork={onFork}
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
							<CollapsibleContent className="flex flex-col gap-0.5 pt-1">
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
