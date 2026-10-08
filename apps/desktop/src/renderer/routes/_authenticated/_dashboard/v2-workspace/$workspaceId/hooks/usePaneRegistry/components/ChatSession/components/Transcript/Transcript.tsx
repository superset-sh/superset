import { Trans, useLingui } from "@lingui/react/macro";
import type {
	OutboxEntry,
	SessionSnapshot,
	TurnGroup,
} from "@superset/chat/core";
import type {
	ApprovalRequest,
	Decision,
	ToolCall,
} from "@superset/chat/protocol";
import {
	MessageScroller,
	useMessageScroller,
	useMessageScrollerScrollable,
} from "@superset/chat-ui/MessageScroller";
import { ScrollToBottomButton } from "@superset/chat-ui/ScrollToBottomButton";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import {
	type CSSProperties,
	type KeyboardEvent,
	type PointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { env } from "renderer/env.renderer";
import {
	CHAT_COLUMN_CLASSNAME,
	CHAT_SCROLLER_GUTTER_CLASSNAME,
} from "../../constants";
import type { ChatForkTarget } from "../../types";
import { pageLinkFinder } from "../../utils/pageLinks";
import { TranscriptRowItem } from "./components/TranscriptRowItem";
import { useLoadOlderOnReach } from "./hooks/useLoadOlderOnReach";
import { useNearRows } from "./hooks/useNearRows";
import { useScrollAnchorKey } from "./hooks/useScrollAnchorKey";
import { useScrollbarGutter } from "./hooks/useScrollbarGutter";
import { lastReplyKeys } from "./utils/lastReplyKeys";
import { type TranscriptRow, transcriptRows } from "./utils/transcriptRows";

const findPageLinks = pageLinkFinder(env.NEXT_PUBLIC_WEB_URL);
const REMEMBER_SIZE_CLASSNAME = "[contain-intrinsic-size:auto_240px]";
const OFFSCREEN_CLASSNAME = "[content-visibility:auto]";
const RECENT_ROWS_RENDERED_IN_FULL = 30;
const SCROLL_KEYS = new Set([
	"ArrowDown",
	"ArrowUp",
	"End",
	"Home",
	"PageDown",
	"PageUp",
	" ",
]);

export type TranscriptProps = {
	groups: TurnGroup[];
	snapshot: SessionSnapshot;
	approvals: ApprovalRequest[];
	outbox: OutboxEntry[];
	hasOlder: boolean;
	onLoadOlder: () => Promise<boolean>;
	onRequestItemBodies: (itemIds: readonly string[]) => void;
	onRespond: (approvalId: string, decision: Decision) => void;
	onFork?: ((target: ChatForkTarget) => void) | undefined;
	canForkToWorktree?: boolean;
	onRetryPrompt: (clientId: string) => void;
	onDiscardPrompt: (clientId: string) => void;
};

function isWork(row: TranscriptRow | undefined): boolean {
	if (!row) return false;
	if (row.kind === "working" || row.kind === "tool_run") return true;
	return (
		row.kind === "item" &&
		(row.item.kind === "tool_call" || row.item.kind === "reasoning")
	);
}

function proseTopPadding(
	row: TranscriptRow,
	previous: TranscriptRow | undefined,
): string | false {
	if (row.kind !== "item" || row.item.kind !== "agent_message") return false;
	return isWork(previous) ? "pt-1" : "pt-3";
}

function rowMessageId(row: TranscriptRow): string {
	if (row.kind === "item") return row.item.id;
	if (row.kind === "tool_run") return row.items[0]?.id ?? row.key;
	return row.key;
}

export function Transcript({
	approvals,
	canForkToWorktree,
	groups,
	hasOlder,
	onDiscardPrompt,
	onFork,
	onLoadOlder,
	onRequestItemBodies,
	onRespond,
	onRetryPrompt,
	outbox,
	snapshot,
}: TranscriptProps) {
	const { t } = useLingui();
	const [viewportRef, scrollbarGutter, viewport] =
		useScrollbarGutter<HTMLDivElement>();
	const olderPages = useLoadOlderOnReach({ hasOlder, onLoadOlder });
	const scroller = useMessageScroller();
	const scrollerRef = useRef(scroller);
	scrollerRef.current = scroller;
	const scrollable = useMessageScrollerScrollable();
	const awayFromEndRef = useRef(scrollable.end);
	awayFromEndRef.current = scrollable.end;
	const readerScrolledAway = useRef(false);
	useEffect(() => {
		if (!scrollable.end) readerScrolledAway.current = false;
	}, [scrollable.end]);
	const markReaderScroll = useCallback(() => {
		readerScrolledAway.current = true;
	}, []);
	const onViewportKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (SCROLL_KEYS.has(event.key)) readerScrolledAway.current = true;
		},
		[],
	);
	const onViewportPointerDown = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (event.target !== event.currentTarget) return;
			readerScrolledAway.current = true;
			// The scroller counts only wheel, touch and scroll keys as the reader's own scroll.
			event.currentTarget.dispatchEvent(
				new WheelEvent("wheel", { bubbles: true }),
			);
		},
		[],
	);

	const [entryOverrides, setEntryOverrides] = useState<
		ReadonlyMap<string, boolean>
	>(new Map());
	const isEntryCollapsed = useCallback(
		(entryKey: string, defaultCollapsed: boolean) =>
			entryOverrides.get(entryKey) ?? defaultCollapsed,
		[entryOverrides],
	);
	const onToggleEntry = useCallback((entryKey: string, collapsed: boolean) => {
		setEntryOverrides((previous) => new Map(previous).set(entryKey, collapsed));
	}, []);

	const pendingApprovalTargets = useMemo(() => {
		const targets = new Set<string>();
		for (const approval of approvals) {
			targets.add(approval.id);
			if (approval.targetItemId) targets.add(approval.targetItemId);
		}
		return targets;
	}, [approvals]);

	const commandsInApprovals = useMemo(() => {
		const ids = new Set<string>();
		for (const approval of approvals) {
			const target = approval.targetItemId
				? snapshot.items.get(approval.targetItemId)?.item
				: undefined;
			if (
				target?.kind === "tool_call" &&
				(target as ToolCall).toolKind === "execute" &&
				(target as ToolCall).title === approval.title
			) {
				ids.add(target.id);
			}
		}
		return ids;
	}, [approvals, snapshot.items]);

	const rows = useMemo(
		() =>
			transcriptRows(
				groups,
				outbox,
				pendingApprovalTargets,
				findPageLinks,
				commandsInApprovals,
			),
		[groups, outbox, pendingApprovalTargets, commandsInApprovals],
	);

	const lastReplies = useMemo(() => lastReplyKeys(rows), [rows]);
	const { seenRowKeys, observeRow } = useNearRows(
		rows,
		viewport,
		onRequestItemBodies,
	);

	const anchorRowKey = useScrollAnchorKey(rows, outbox, {
		turnRunning: groups.at(-1)?.turn?.status === "running",
		readerScrolledAway,
	});

	const firstPendingApprovalId = approvals[0]?.id ?? null;
	useEffect(() => {
		if (!firstPendingApprovalId || !awayFromEndRef.current) return;
		scrollerRef.current.scrollToMessage(firstPendingApprovalId, {
			align: "nearest",
		});
	}, [firstPendingApprovalId]);

	const contentChildren = rows.map((row, index) => {
		const recent = index >= rows.length - RECENT_ROWS_RENDERED_IN_FULL;
		const scrollAnchor = row.key === anchorRowKey;
		return (
			<TranscriptRowItem
				canForkToWorktree={canForkToWorktree}
				className={cn(
					REMEMBER_SIZE_CLASSNAME,
					!recent && OFFSCREEN_CLASSNAME,
					"px-4 pb-1",
					proseTopPadding(row, rows[index - 1]),
				)}
				isEntryCollapsed={isEntryCollapsed}
				key={row.key}
				lastReply={lastReplies.has(row.key)}
				messageId={rowMessageId(row)}
				onDiscardPrompt={onDiscardPrompt}
				onFork={onFork}
				onRespond={onRespond}
				onRetryPrompt={onRetryPrompt}
				onToggleEntry={onToggleEntry}
				rendered={recent || scrollAnchor || seenRowKeys.has(row.key)}
				row={row}
				rowRef={observeRow(row.key)}
				scrollAnchor={scrollAnchor}
				snapshot={snapshot}
			/>
		);
	});

	return (
		<MessageScroller.Root className="relative flex min-h-0 min-w-0 flex-1 flex-col">
			<MessageScroller.Viewport
				aria-label={t({ message: "Messages" })}
				className={cn(
					"min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]",
					CHAT_SCROLLER_GUTTER_CLASSNAME,
				)}
				onKeyDown={onViewportKeyDown}
				onPointerDown={onViewportPointerDown}
				onTouchMove={markReaderScroll}
				onWheel={markReaderScroll}
				ref={viewportRef}
				style={
					{ "--scrollbar-gutter": `${scrollbarGutter}px` } as CSSProperties
				}
			>
				{hasOlder && (
					<div
						className={cn(
							CHAT_COLUMN_CLASSNAME,
							"flex h-10 items-center justify-center",
						)}
						ref={olderPages.sentinelRef}
					>
						{olderPages.failed ? (
							<Button onClick={olderPages.retry} size="sm" variant="ghost">
								<Trans>Couldn't load earlier messages. Retry</Trans>
							</Button>
						) : (
							olderPages.loading && <Spinner className="size-4" />
						)}
					</div>
				)}
				<MessageScroller.Content
					className={cn(
						CHAT_COLUMN_CLASSNAME,
						"flex select-text flex-col pt-4 pb-8",
					)}
				>
					{contentChildren}
				</MessageScroller.Content>
			</MessageScroller.Viewport>
			<div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
				<ScrollToBottomButton />
			</div>
		</MessageScroller.Root>
	);
}
