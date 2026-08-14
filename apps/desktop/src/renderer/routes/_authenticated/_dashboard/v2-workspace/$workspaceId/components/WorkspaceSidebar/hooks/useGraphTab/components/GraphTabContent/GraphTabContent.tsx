import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Clipboard, ExternalLink, FileText, Hash } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type { GraphCommit, GraphRefScope } from "../../types";
import { assignLanes } from "../../utils/assignLanes";
import { GraphHeaderActions } from "../GraphHeaderActions";
import { graphRowHeight } from "../GraphLanes";
import { GraphRow } from "../GraphRow";

const OVERSCAN = 10;

// A ref with no open Superset workspace behind it. `open` and `merged` are
// accounted for; null-state refs (HEAD, remotes, tags) never qualify.
const UNREFERENCED_STATES = new Set([
	"detached-worktree",
	"orphan-branch",
	"prunable",
]);

/** A row carries refs onto the two-line layout only when the toggle is on AND
 *  it actually has refs. Exported so estimateSize and the test share one rule. */
export function isTwoLineRow(
	refs: Array<{ state: string | null }>,
	twoLineRefs: boolean,
): boolean {
	return twoLineRefs && refs.length > 0;
}

/** The virtualizer's size + key derivation, extracted so the invariant that
 *  broke (a commit's key and height must survive a list shift) is testable
 *  without a DOM. */
export function graphRowSizer(
	rows: Array<{
		commit: { hash: string; refs: Array<{ state: string | null }> };
	}>,
	options: { compact: boolean; twoLineRefs: boolean },
): { getItemKey: (i: number) => string; estimateSize: (i: number) => number } {
	const { compact, twoLineRefs } = options;
	return {
		getItemKey: (i) => rows[i].commit.hash,
		estimateSize: (i) =>
			graphRowHeight({
				compact,
				twoLine: isTwoLineRow(rows[i].commit.refs, twoLineRefs),
			}),
	};
}

/** A commit carries an "unreferenced" ref when one of its refs has no open
 *  workspace behind it (detached-worktree / orphan-branch / prunable). The
 *  §4.3 filter highlights these and dims the rest, so this is the predicate
 *  that keeps a row bright. `merged` and `open` count as referenced; null-state
 *  refs (HEAD, remotes, tags) never qualify. */
export function hasUnreferencedRef(
	refs: Array<{ state: string | null }>,
): boolean {
	return refs.some((r) => r.state && UNREFERENCED_STATES.has(r.state));
}

/**
 * What the graph currently highlights. Derived from the persisted
 * `graphSelection` (graph-owned, separate from the Changes tab's
 * changesFilter so the two surfaces don't fight over one selection).
 */
export type GraphSelection =
	| { kind: "none" }
	| { kind: "commit"; hash: string }
	| { kind: "range"; fromHash: string; toHash: string };

/**
 * Resolve a selection to per-row highlight sets, given the loaded window's
 * commit hashes in display order (newest first). `inRange` covers rows strictly
 * between the two range endpoints; an endpoint outside the window is simply not
 * highlighted. Exported for unit testing.
 */
export function resolveRowSelection(
	selection: GraphSelection,
	hashes: string[],
): { selectedSet: Set<string>; inRangeSet: Set<string> } {
	if (selection.kind === "none") {
		return { selectedSet: new Set<string>(), inRangeSet: new Set<string>() };
	}
	const indexByHash = new Map<string, number>();
	for (let i = 0; i < hashes.length; i++) indexByHash.set(hashes[i], i);
	if (selection.kind === "commit") {
		return {
			selectedSet: new Set([selection.hash]),
			inRangeSet: new Set<string>(),
		};
	}
	const selected = new Set<string>();
	const inRange = new Set<string>();
	const fromIdx = indexByHash.get(selection.fromHash);
	const toIdx = indexByHash.get(selection.toHash);
	if (fromIdx !== undefined) selected.add(selection.fromHash);
	if (toIdx !== undefined) selected.add(selection.toHash);
	if (fromIdx !== undefined && toIdx !== undefined) {
		const lo = Math.min(fromIdx, toIdx);
		const hi = Math.max(fromIdx, toIdx);
		for (let i = lo + 1; i < hi; i++) inRange.add(hashes[i]);
	}
	return { selectedSet: selected, inRangeSet: inRange };
}

interface GraphTabContentProps {
	commits: GraphCommit[];
	totalCommits: number | null;
	/** A nextCursor was returned — more commits exist beyond the fetched window. */
	hasMore: boolean;
	limit: number;
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	error?: unknown;
	compact: boolean;
	laneCap: number;
	showDate: boolean;
	/** Which refs seed the traversal. Shown in the strip's scope chooser. */
	refScope?: GraphRefScope;
	onSelectRefScope?: (scope: GraphRefScope) => void;
	/** Put ref badges on their own line (§4.2). Drives estimateSize + GraphRow. */
	twoLineRefs?: boolean;
	onToggleTwoLineRefs?: () => void;
	/** Dim referenced commits so unreferenced refs stand out (§4.3). */
	unreferencedOnly?: boolean;
	onToggleUnreferencedOnly?: () => void;
	selection: GraphSelection;
	onSelectRow: (
		hash: string,
		modifiers: { shiftKey: boolean; metaKey: boolean },
	) => void;
	/** Pin the preview pane a single click just opened (double-click). */
	onDoubleClickRow: (hash: string) => void;
	/** Open a commit diff pane in a new tab/pane (row context menu). */
	onOpenInNewTab?: (hash: string) => void;
}

export function GraphTabContent({
	commits,
	totalCommits,
	hasMore,
	limit: _limit,
	isLoading,
	isFetching,
	isError,
	error,
	compact,
	laneCap,
	showDate,
	refScope = "local",
	onSelectRefScope,
	twoLineRefs = false,
	onToggleTwoLineRefs,
	unreferencedOnly = false,
	onToggleUnreferencedOnly,
	selection,
	onSelectRow,
	onDoubleClickRow,
	onOpenInNewTab,
}: GraphTabContentProps) {
	const rows = useMemo(() => assignLanes(commits), [commits]);
	const listRef = useRef<HTMLDivElement>(null);
	const { copyToClipboard } = useCopyToClipboard();

	// Row context menu: read-only copy actions + open-in-new-tab. Handled by
	// event delegation on the list (closest [data-hash]) so GraphRow stays a
	// pure presentational component. A controlled DropdownMenu anchored at the
	// cursor handles positioning and outside-click, mirroring the file-tree row.
	const [menu, setMenu] = useState<{
		commit: GraphCommit;
		x: number;
		y: number;
	} | null>(null);
	const closeMenu = useCallback(() => setMenu(null), []);
	const handleContextMenu = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			const target = (event.target as HTMLElement).closest("[data-hash]");
			const hash = target?.getAttribute("data-hash");
			if (!hash) return;
			const row = rows.find((r) => r.commit.hash === hash);
			if (!row) return;
			event.preventDefault();
			setMenu({ commit: row.commit, x: event.clientX, y: event.clientY });
		},
		[rows],
	);
	const copyValue = useCallback(
		async (text: string, label: string) => {
			try {
				await copyToClipboard(text);
				toast.success(`${label} copied`);
			} catch (err: unknown) {
				toast.error(
					`Failed to copy: ${err instanceof Error ? err.message : "Unknown error"}`,
				);
			}
		},
		[copyToClipboard],
	);

	const sizer = useMemo(
		() => graphRowSizer(rows, { compact, twoLineRefs }),
		[rows, compact, twoLineRefs],
	);
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => listRef.current,
		estimateSize: sizer.estimateSize,
		// Key the size cache by commit, not by index. Refs move while the tab is
		// open, so a refetch that prepends one commit shifts every index by one —
		// with the default index key, a two-line row inherits the cached height of
		// whatever used to sit at its position and either overlaps the row below
		// (cached too short) or leaves a blank band (cached too tall).
		getItemKey: sizer.getItemKey,
		overscan: OVERSCAN,
	});

	// Row height is a function of (refs, compact, twoLineRefs); the virtualizer
	// caches sizes, so anything that changes one needs an explicit remeasure or
	// the list keeps the old offsets. `rows` is in here because a ref landing on
	// or leaving a commit changes that commit's height at an unchanged hash,
	// which getItemKey alone cannot catch.
	// biome-ignore lint/correctness/useExhaustiveDependencies: estimateSize closes over rows/compact/twoLineRefs via graphRowHeight; remeasure when any changes (the effect body only touches virtualizer).
	useEffect(() => {
		virtualizer.measure();
	}, [virtualizer, rows, compact, twoLineRefs]);

	const items = virtualizer.getVirtualItems();

	const hashes = useMemo(() => rows.map((r) => r.commit.hash), [rows]);
	// Per-row highlight sets (see resolveRowSelection). Memoized on the hash
	// list + selection so a scroll-only render doesn't recompute.
	const { selectedSet, inRangeSet } = useMemo(
		() => resolveRowSelection(selection, hashes),
		[hashes, selection],
	);

	// Cache-first (AGENTS rule 11): existing rows keep rendering while a
	// background refetch is in flight. The status flags only decide what to
	// show when there is no data yet.
	const showLoading = rows.length === 0 && isLoading;
	const showError = rows.length === 0 && isError;
	const showEmpty = rows.length === 0 && !isLoading && !isError;

	const truncated = totalCommits != null ? totalCommits > rows.length : hasMore;
	const shownCount = rows.length;

	return (
		<div className="flex h-full min-h-0 flex-col">
			{/* One control strip: truncation copy on the left, the graph's own
			    scope chooser + toggles on the right. Deliberately not
			    SidebarHeader's `actions` slot — see GraphHeaderActions. Rendered
			    even with zero rows: a scope that returns nothing would otherwise
			    take its own chooser away and strand the graph empty. */}
			{onSelectRefScope && onToggleTwoLineRefs && onToggleUnreferencedOnly && (
				<div className="flex h-6 shrink-0 items-center gap-1 border-b border-border bg-muted/40 px-2">
					<span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
						{truncated && shownCount > 0
							? `Showing first ${shownCount}${totalCommits != null ? ` of ${totalCommits}` : ""} commits`
							: null}
					</span>
					<span className="flex shrink-0 items-center gap-0.5">
						<GraphHeaderActions
							refScope={refScope}
							onSelectRefScope={onSelectRefScope}
							twoLineRefs={twoLineRefs}
							onToggleTwoLineRefs={onToggleTwoLineRefs}
							unreferencedOnly={unreferencedOnly}
							onToggleUnreferencedOnly={onToggleUnreferencedOnly}
						/>
					</span>
				</div>
			)}
			{isFetching && shownCount > 0 && (
				<div className="shrink-0 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
					Updating…
				</div>
			)}
			{showLoading && (
				<div className="px-3 py-6 text-center text-xs text-muted-foreground">
					Loading commits…
				</div>
			)}
			{showError && (
				<div className="select-text cursor-text px-3 py-6 text-center text-xs text-destructive">
					{error instanceof Error ? error.message : "Failed to load git graph"}
				</div>
			)}
			{showEmpty && (
				<div className="px-3 py-6 text-center text-xs text-muted-foreground">
					No commits yet
				</div>
			)}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: delegated right-click context menu for a virtualized commit list */}
			<div
				ref={listRef}
				className="min-h-0 flex-1 overflow-y-auto"
				onContextMenu={handleContextMenu}
			>
				<div
					className="relative w-full"
					style={{ height: virtualizer.getTotalSize() }}
				>
					{items.map((virtualRow) => {
						const row = rows[virtualRow.index];
						const hash = row.commit.hash;
						return (
							<div
								key={hash}
								data-index={virtualRow.index}
								data-hash={hash}
								className="absolute left-0 w-full"
								style={{ top: virtualRow.start }}
							>
								<GraphRow
									row={row}
									compact={compact}
									selected={selectedSet.has(hash)}
									inRange={inRangeSet.has(hash)}
									onSelect={(event) =>
										onSelectRow(hash, {
											shiftKey: event.shiftKey,
											metaKey: event.metaKey || event.ctrlKey,
										})
									}
									onDoubleClick={() => onDoubleClickRow(hash)}
									laneCap={laneCap}
									showDate={showDate}
									twoLineRefs={twoLineRefs}
									dimmed={
										unreferencedOnly && !hasUnreferencedRef(row.commit.refs)
									}
								/>
							</div>
						);
					})}
				</div>
			</div>
			{menu && (
				<DropdownMenu open onOpenChange={(open) => !open && closeMenu()}>
					<DropdownMenuTrigger asChild>
						<span
							aria-hidden
							style={{
								position: "fixed",
								left: menu.x,
								top: menu.y,
								width: 0,
								height: 0,
								pointerEvents: "none",
							}}
						/>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-52" align="start">
						<DropdownMenuItem
							onSelect={() => void copyValue(menu.commit.hash, "Hash")}
						>
							<Clipboard />
							Copy Hash
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() =>
								void copyValue(menu.commit.shortHash, "Short hash")
							}
						>
							<Hash />
							Copy Short Hash
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => void copyValue(menu.commit.message, "Subject")}
						>
							<FileText />
							Copy Subject
						</DropdownMenuItem>
						{onOpenInNewTab && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onSelect={() => {
										onOpenInNewTab(menu.commit.hash);
										closeMenu();
									}}
								>
									<ExternalLink />
									Open in New Tab
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}
