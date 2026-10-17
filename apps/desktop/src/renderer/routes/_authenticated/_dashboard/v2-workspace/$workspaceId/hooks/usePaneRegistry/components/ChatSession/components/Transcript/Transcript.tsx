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
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { env } from "renderer/env.renderer";
import { usePluginMentionOptions } from "renderer/hooks/usePluginMentionOptions";
import {
	CHAT_COLUMN_CLASSNAME,
	CHAT_SCROLLER_GUTTER_CLASSNAME,
} from "../../constants";
import type { ChatForkTarget } from "../../types";
import { pageLinkFinder } from "../../utils/pageLinks";
import { TranscriptFindBar } from "./components/TranscriptFindBar";
import { TranscriptRowItem } from "./components/TranscriptRowItem";
import { useLoadOlderOnReach } from "./hooks/useLoadOlderOnReach";
import { useNearRows } from "./hooks/useNearRows";
import { useScrollAnchorKey } from "./hooks/useScrollAnchorKey";
import { useScrollbarGutter } from "./hooks/useScrollbarGutter";
import { useTranscriptFind } from "./hooks/useTranscriptFind";
import { useTranscriptWindow } from "./hooks/useTranscriptWindow";
import { ChatImageGalleryProvider } from "./providers/ChatImageGalleryProvider";
import { copySourceText } from "./utils/copySourceText";
import { galleryImages } from "./utils/galleryImages";
import { lastReplyKeys } from "./utils/lastReplyKeys";
import {
	rowMessageId,
	type TranscriptRow,
	transcriptRows,
} from "./utils/transcriptRows";

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
	sessionId: string;
	revealMessageId?: string | null;
	onMessageRevealed?: () => void;
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
	/** The pane has focus, so ⌘F opens the find bar here. */
	isActive?: boolean;
	/** The reader closed the find bar; focus belongs back in the composer. */
	onCloseFind?: (() => void) | undefined;
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

export function Transcript({
	approvals,
	canForkToWorktree,
	groups,
	hasOlder,
	isActive = false,
	onCloseFind,
	onDiscardPrompt,
	onFork,
	onLoadOlder,
	onRequestItemBodies,
	onRespond,
	onRetryPrompt,
	onMessageRevealed,
	outbox,
	revealMessageId = null,
	sessionId,
	snapshot,
}: TranscriptProps) {
	const { t } = useLingui();
	const plugins = usePluginMentionOptions();
	const installedPluginNames = useMemo(
		() => new Set(plugins.map((plugin) => plugin.name)),
		[plugins],
	);
	const [viewportRef, scrollbarGutter, viewport] =
		useScrollbarGutter<HTMLDivElement>();
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

	useEffect(() => {
		const opened = rows.filter(
			(row) =>
				row.kind === "tool_run" &&
				!row.defaultCollapsed &&
				!entryOverrides.has(row.key),
		);
		if (opened.length === 0) return;
		setEntryOverrides((previous) => {
			const next = new Map(previous);
			for (const row of opened) next.set(row.key, false);
			return next;
		});
	}, [rows, entryOverrides]);

	const lastReplies = useMemo(() => lastReplyKeys(rows), [rows]);
	const gallery = useMemo(() => galleryImages(rows), [rows]);
	const availableCommands = snapshot.session?.availableCommands;
	const commands = useMemo(
		() => new Map(availableCommands?.map((command) => [command.name, command])),
		[availableCommands],
	);
	const { seenRowKeys, observeRow } = useNearRows(
		rows,
		viewport,
		onRequestItemBodies,
	);

	const anchorRowKey = useScrollAnchorKey(rows, outbox, {
		turnRunning: groups.at(-1)?.turn?.status === "running",
		readerScrolledAway,
	});

	const find = useTranscriptFind({
		rows,
		onRequestItemBodies,
		installedPluginNames,
		snapshot,
		viewport,
		isActive,
		isEntryCollapsed,
		onToggleEntry,
		scrollToMessage: scroller.scrollToMessage,
		onClose: onCloseFind,
	});
	// A search covers the whole conversation, so it pages every turn in.
	const olderPages = useLoadOlderOnReach({
		hasOlder,
		onLoadOlder,
		eager: find.isOpen,
	});

	const revealRowKey = useMemo(
		() =>
			revealMessageId === null
				? null
				: (rows.find((row) => rowMessageId(row) === revealMessageId)?.key ??
					null),
		[rows, revealMessageId],
	);
	const findMountsAll = useDeferredValue(find.isOpen);
	const transcriptWindow = useTranscriptWindow({
		rows,
		viewport,
		sessionId,
		pinnedRowKeys: [
			anchorRowKey,
			findMountsAll ? (rows[0]?.key ?? null) : null,
			find.currentRowKey,
			revealRowKey,
		],
		observeRow,
	});
	const { resetToTail, holdRevealUntilScrollEnds } = transcriptWindow;
	const findWasOpen = useRef(false);
	useEffect(() => {
		if (findWasOpen.current && !find.isOpen && !awayFromEndRef.current) {
			resetToTail();
		}
		findWasOpen.current = find.isOpen;
	}, [find.isOpen, resetToTail]);

	useEffect(() => {
		if (revealMessageId === null) return;
		holdRevealUntilScrollEnds();
		scrollerRef.current.scrollToMessage(revealMessageId, {
			align: "start",
			behavior: "smooth",
		});
		onMessageRevealed?.();
	}, [revealMessageId, onMessageRevealed, holdRevealUntilScrollEnds]);

	const firstPendingApprovalId = approvals[0]?.id ?? null;
	useEffect(() => {
		if (!firstPendingApprovalId || !awayFromEndRef.current) return;
		scrollerRef.current.scrollToMessage(firstPendingApprovalId, {
			align: "nearest",
		});
	}, [firstPendingApprovalId]);

	const contentChildren = rows
		.slice(transcriptWindow.startIndex)
		.map((row, offset) => {
			const index = transcriptWindow.startIndex + offset;
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
					commands={commands}
					isEntryCollapsed={isEntryCollapsed}
					key={row.key}
					lastReply={lastReplies.has(row.key)}
					messageId={rowMessageId(row)}
					onDiscardPrompt={onDiscardPrompt}
					onFork={onFork}
					onRespond={onRespond}
					onRetryPrompt={onRetryPrompt}
					onToggleEntry={onToggleEntry}
					rendered={
						recent ||
						scrollAnchor ||
						seenRowKeys.has(row.key) ||
						row.key === find.currentRowKey ||
						row.key === revealRowKey
					}
					row={row}
					rowRef={transcriptWindow.rowRef(row.key)}
					scrollAnchor={scrollAnchor}
					snapshot={snapshot}
				/>
			);
		});

	return (
		<MessageScroller.Root className="relative flex min-h-0 min-w-0 flex-1 flex-col">
			<ChatImageGalleryProvider images={gallery}>
				<TranscriptFindBar
					currentIndex={find.currentIndex}
					inputRef={find.inputRef}
					isOpen={find.isOpen}
					loading={
						find.loading || (find.isOpen && hasOlder && !olderPages.failed)
					}
					matchCount={find.matchCount}
					onClose={find.close}
					onNext={find.next}
					onPrevious={find.previous}
					onQueryChange={find.setQuery}
					query={find.query}
				/>
				<MessageScroller.Viewport
					aria-label={t({ message: "Messages" })}
					className={cn(
						"min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]",
						CHAT_SCROLLER_GUTTER_CLASSNAME,
					)}
					onCopy={copySourceText}
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
					{transcriptWindow.startIndex > 0 && (
						<div
							aria-hidden="true"
							ref={transcriptWindow.spacerRef}
							style={{ height: transcriptWindow.spacerHeight }}
						/>
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
			</ChatImageGalleryProvider>
		</MessageScroller.Root>
	);
}
