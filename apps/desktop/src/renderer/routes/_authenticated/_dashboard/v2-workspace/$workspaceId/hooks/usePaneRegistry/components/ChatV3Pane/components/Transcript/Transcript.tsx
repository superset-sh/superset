import { Trans, useLingui } from "@lingui/react/macro";
import type {
	OutboxEntry,
	SessionSnapshot,
	TurnGroup,
} from "@superset/chat/core";
import type { ApprovalRequest, Decision, Item } from "@superset/chat/protocol";
import { TextSelectionPopover } from "@superset/ui/ai-elements/text-selection-popover";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TurnGroupSection } from "./components/TurnGroupSection";

export type TranscriptProps = {
	groups: TurnGroup[];
	snapshot: SessionSnapshot;
	approvals: ApprovalRequest[];
	outbox: OutboxEntry[];
	hasOlder: boolean;
	onLoadOlder: () => void;
	onRespond: (approvalId: string, decision: Decision) => void;
	onRetryPrompt: (clientId: string) => void;
	onDiscardPrompt: (clientId: string) => void;
	pinnedItemIds: ReadonlySet<string>;
	onTogglePin: (item: Item) => void;
	jumpToItemId: { itemId: string; nonce: number } | null;
	onJumpSettled: () => void;
	onQuoteText: (text: string) => void;
};

function latestUserItemId(groups: TurnGroup[]): string | null {
	for (let groupIndex = groups.length - 1; groupIndex >= 0; groupIndex -= 1) {
		const group = groups[groupIndex];
		if (!group) continue;
		for (let index = group.entries.length - 1; index >= 0; index -= 1) {
			const entry = group.entries[index];
			if (entry?.kind === "item" && entry.item.kind === "user_message") {
				return entry.item.id;
			}
		}
	}
	return null;
}

function outboxText(entry: OutboxEntry): string {
	return entry.content
		.filter((content) => content.type === "text")
		.map((content) => content.text)
		.join("\n");
}

export function Transcript({
	approvals,
	groups,
	hasOlder,
	jumpToItemId,
	onDiscardPrompt,
	onJumpSettled,
	onLoadOlder,
	onQuoteText,
	onRespond,
	onRetryPrompt,
	onTogglePin,
	outbox,
	pinnedItemIds,
	snapshot,
}: TranscriptProps) {
	const { t } = useLingui();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [entryOverrides, setEntryOverrides] = useState<
		ReadonlyMap<string, boolean>
	>(new Map());

	const isEntryCollapsed = useCallback(
		(entryKey: string, defaultCollapsed: boolean) =>
			entryOverrides.get(entryKey) ?? defaultCollapsed,
		[entryOverrides],
	);
	const onToggleEntry = useCallback((entryKey: string, collapsed: boolean) => {
		setEntryOverrides((previous) => {
			const next = new Map(previous);
			next.set(entryKey, collapsed);
			return next;
		});
	}, []);
	const expandAll = useCallback(() => {
		setEntryOverrides((previous) => {
			const next = new Map<string, boolean>();
			for (const key of previous.keys()) next.set(key, false);
			for (const group of groups) {
				group.entries.forEach((entry, index) => {
					if (entry.kind === "tool_run") {
						next.set(`${group.turnId}:${index}`, false);
					}
				});
			}
			return next;
		});
	}, [groups]);

	const pendingApprovalTargets = useMemo(() => {
		const targets = new Set<string>();
		for (const approval of approvals) {
			targets.add(approval.id);
			if (approval.targetItemId) targets.add(approval.targetItemId);
		}
		return targets;
	}, [approvals]);

	const anchorItemId = latestUserItemId(groups);
	useEffect(() => {
		if (!anchorItemId) return;
		containerRef.current
			?.querySelector(`[data-item-id="${CSS.escape(anchorItemId)}"]`)
			?.scrollIntoView({ block: "start" });
	}, [anchorItemId]);

	const firstPendingApprovalId = approvals[0]?.id ?? null;
	useEffect(() => {
		if (!firstPendingApprovalId) return;
		containerRef.current
			?.querySelector(`[data-item-id="${CSS.escape(firstPendingApprovalId)}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [firstPendingApprovalId]);

	const jumpAttemptsRef = useRef(0);
	const lastJumpNonceRef = useRef<number | null>(null);
	useEffect(() => {
		if (!jumpToItemId) return;
		if (lastJumpNonceRef.current !== jumpToItemId.nonce) {
			lastJumpNonceRef.current = jumpToItemId.nonce;
			jumpAttemptsRef.current = 0;
		}
		const itemLoaded = groups.some((group) =>
			group.entries.some(
				(entry) =>
					entry.kind === "item" && entry.item.id === jumpToItemId.itemId,
			),
		);
		if (itemLoaded) {
			const element = containerRef.current?.querySelector(
				`[data-item-id="${CSS.escape(jumpToItemId.itemId)}"]`,
			);
			if (element) {
				// Rows render with content-visibility: auto, so the first scroll
				// can land on the estimated size — scroll again post-layout.
				element.scrollIntoView({ block: "start" });
				requestAnimationFrame(() => element.scrollIntoView({ block: "start" }));
			}
			jumpAttemptsRef.current = 0;
			onJumpSettled();
			return;
		}
		if (hasOlder && jumpAttemptsRef.current < 10) {
			jumpAttemptsRef.current += 1;
			onLoadOlder();
		} else {
			jumpAttemptsRef.current = 0;
			onJumpSettled();
		}
	}, [jumpToItemId, groups, hasOlder, onJumpSettled, onLoadOlder]);

	return (
		<div
			className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
			ref={containerRef}
		>
			<TextSelectionPopover
				containerRef={containerRef}
				onAfterAction={() => containerRef.current?.focus()}
				primaryAction={{
					label: t({ message: "Quote" }),
					onClick: onQuoteText,
				}}
			/>
			<div className="flex items-center gap-2">
				{hasOlder && (
					<Button onClick={onLoadOlder} size="sm" variant="ghost">
						<Trans>Load earlier messages</Trans>
					</Button>
				)}
				<Button
					className="ml-auto text-xs text-muted-foreground"
					onClick={expandAll}
					size="sm"
					variant="ghost"
				>
					<Trans>Expand all</Trans>
				</Button>
			</div>
			{groups.map((group) => (
				<TurnGroupSection
					group={group}
					isEntryCollapsed={isEntryCollapsed}
					key={group.turnId}
					onRespond={onRespond}
					onToggleEntry={onToggleEntry}
					onTogglePin={onTogglePin}
					pendingApprovalTargets={pendingApprovalTargets}
					pinnedItemIds={pinnedItemIds}
					snapshot={snapshot}
				/>
			))}
			{outbox.map((entry) => (
				<div
					className="flex flex-col items-end gap-1 self-end"
					key={entry.clientId}
				>
					<div className="max-w-[80%] whitespace-pre-wrap break-words rounded-lg bg-primary/10 px-3 py-2 text-sm">
						{outboxText(entry)}
					</div>
					<div className="flex items-center gap-2">
						<Badge
							variant={entry.state === "failed" ? "destructive" : "outline"}
						>
							{entry.state === "failed" ? (
								<Trans>Failed to send</Trans>
							) : (
								<Trans>Sending</Trans>
							)}
						</Badge>
						{entry.state === "failed" && (
							<>
								<Button
									onClick={() => onRetryPrompt(entry.clientId)}
									size="sm"
									variant="ghost"
								>
									<Trans>Retry</Trans>
								</Button>
								<Button
									onClick={() => onDiscardPrompt(entry.clientId)}
									size="sm"
									variant="ghost"
								>
									<Trans>Discard</Trans>
								</Button>
							</>
						)}
					</div>
				</div>
			))}
		</div>
	);
}
