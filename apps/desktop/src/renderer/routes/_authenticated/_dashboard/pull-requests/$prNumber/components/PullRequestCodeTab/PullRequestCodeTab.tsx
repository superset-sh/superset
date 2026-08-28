import { Trans, useLingui } from "@lingui/react/macro";
import type {
	CodeViewItem,
	CodeViewOptions,
	DiffLineAnnotation,
	SelectedLineRange,
} from "@pierre/diffs";
import { parsePatchFiles } from "@pierre/diffs";
import { CodeView, type CodeViewHandle } from "@pierre/diffs/react";
import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";
import { errorMessage } from "@superset/i18n/errors";
import { sanitizePromptForPty } from "@superset/shared/agent-prompt-launch";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	LuChevronDown,
	LuChevronRight,
	LuChevronUp,
	LuColumns2,
	LuFiles,
	LuFoldVertical,
	LuRows2,
	LuUnfoldVertical,
} from "react-icons/lu";
import {
	type AgentPromptFileSide,
	formatAgentPromptWithFileContext,
} from "renderer/hooks/host-service/useSendToTerminalAgent";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	createPierreTreeStyle,
	PIERRE_TREE_UNSAFE_CSS,
	type PierreGitStatus,
} from "renderer/lib/pierreTree";
import { normalizeTerminalCommand } from "renderer/lib/terminal/launch-command";
import { WorkItemDetailState } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState";
import type { AgentTarget } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/AgentCommentComposer/hooks/useDiffCommentTarget";
import { useDiffCodeViewTheme } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/DiffPane/hooks/useDiffCodeViewTheme";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { useSettings } from "renderer/stores/settings";
import { useResolvedTheme } from "renderer/stores/theme";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates/useWorkspaceCreates";
import { PullRequestCommentComposer } from "../PullRequestCommentComposer";
import { PullRequestCommentThread } from "../PullRequestCommentThread";

interface PullRequestCodeTabProps {
	projectId: string;
	prNumber: number;
	prUrl: string;
	hostUrl: string;
	hostId: string | null;
}

interface PrCommentThreadComment {
	id: string;
	authorLogin: string;
	avatarUrl?: string;
	body: string;
	createdAt?: number;
}

interface PrCommentThreadMetadata {
	kind: "thread";
	threadId: string;
	/** REST databaseId of a comment already in the thread — replies thread
	 *  onto it regardless of which comment they target. Undefined only if
	 *  GitHub ever returns a thread with zero comments (shouldn't happen). */
	replyToCommentId?: number;
	comments: PrCommentThreadComment[];
	isResolved: boolean;
	isOutdated: boolean;
	url?: string;
}

interface PrDraftCommentMetadata {
	kind: "composer";
	path: string;
	startLine: number;
	endLine: number;
	startSide: "additions" | "deletions";
	endSide: "additions" | "deletions";
}

type PrAnnotationMetadata = PrCommentThreadMetadata | PrDraftCommentMetadata;

interface OrderedThread {
	threadId: string;
	itemId: string;
	lineNumber: number;
	side: "additions" | "deletions";
}

interface ComposerState {
	itemId: string;
	path: string;
	range: SelectedLineRange;
}

// Wider than the tree's other call sites: PR diffs commonly nest several
// levels deeper than a plain file explorer (app/components/FooSection/...),
// and Pierre's row-level overflow detection truncates names hardest at
// depth, where indentation leaves the least room for the name itself.
const DEFAULT_TREE_WIDTH = 288;
const MIN_TREE_WIDTH = 200;
const MAX_TREE_WIDTH = 560;

const ITEM_HEIGHT = 24;
const TREE_STYLE = createPierreTreeStyle({
	rowHeight: ITEM_HEIGHT,
	levelIndent: 8,
});

// Below this window width, the tree+diff split gets cramped enough that a
// fully-expanded tree (Pierre's "open" default) eats more room than it's
// worth — default to collapsed so the diff gets the space and the reviewer
// expands only the folders they need. `useFileTree`'s initialExpansion is
// a one-time value baked into the tree's store at creation, so this reads
// window.innerWidth once at mount rather than reactively tracking the
// pane's own width — a fully reactive re-collapse on resize would need a
// bulk collapse-all the tree model doesn't expose.
const NARROW_WINDOW_WIDTH_THRESHOLD = 1400;
// Below this (stricter) *pane* width — this tab's own rendered width, via
// ResizeObserver, not the window's — even a collapsed-folders tree panel is
// more than the split can spare, so the whole panel hides by default. Unlike
// NARROW_WINDOW_WIDTH_THRESHOLD this one does stay reactive after mount:
// isTreeCollapsed is plain component state (no Pierre store tied to it), so
// nothing stops it tracking width for the tab's whole lifetime.
const NARROW_PANE_WIDTH_HIDE_TREE_THRESHOLD = 1150;

// Extra unsafeCSS appended to (not replacing) useDiffCodeViewTheme's own —
// that hook is shared with the v2-workspace DiffPane, so styling specific to
// this tab lives here instead of there.
//
// [data-diff]'s --diffs-light-bg/--diffs-dark-bg override: the shared hook
// sources its background from the *terminal* theme
// (terminalTheme?.background ?? var(--background)), which makes sense for
// DiffPane sitting next to terminal panes, but this tab has no terminal
// nearby and the terminal theme's default background doesn't match this
// app's own var(--background) — re-overridden here (both are !important, so
// this wins by appearing later in the concatenated string) back to the
// token the rest of the tab actually uses. The CodeView root's own
// `style.backgroundColor` gets the equivalent fix directly as a prop
// (see codeViewStyle) since that one isn't reachable through unsafeCSS.
//
// Card-per-file look: Pierre has no single wrapping element around one
// file's header+content (confirmed live: [data-diffs-header]'s
// parentElement is the shadow root itself), so the "card" is an illusion
// built from two adjacent elements — the header gets rounded top corners,
// the diff body gets rounded bottom corners, matching borders on both meet
// with no gap between them, and layout.gap (set where this is used) puts
// real space before the *next* file's header. Mirrors packages/ui's shared
// Card component's own recipe (rounded-xl border shadow-sm) rather than
// inventing a new one.
//
// A function (not a static string) because the additions/deletions colors
// are theme-branched in JS — mirroring useDiffCodeViewTheme's own
// additionColor/deletionColor — rather than relying on a `.dark` selector,
// which can't reach in from outside the shadow root the way a CSS custom
// property can.
function prCodeTabCardUnsafeCss(
	additionsColor: string,
	deletionsColor: string,
): string {
	return `
	[data-diffs-header='default'] {
		border: 1px solid var(--border);
		border-bottom: none;
		border-top-left-radius: 0.75rem;
		border-top-right-radius: 0.75rem;
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		/* Pushes [data-metadata] (the +/- count) to the card's right edge
		 * instead of leaving it flush against the filename — matches the
		 * PR list row's own diff-stat placement. Overrides the shared
		 * hook's flex-start (same selector, appended later so it wins). */
		justify-content: space-between;
		/* Pierre's own padding (0 16px) sits the collapse chevron well right
		 * of the Files pill above it (px-2 on the toolbar row, 8px) — cut to
		 * match so the two rows read as left-aligned. */
		padding-left: 8px;
	}
	/* Every header carries data-sticky from first render (confirmed live —
	 * it's there even scrolled to the very top), since position: sticky
	 * pins it while the code column scrolls behind it, not clipped away.
	 * Rounded top corners cut a notch out of the header's own background,
	 * and whatever's scrolled behind shows through that notch as a stray
	 * border/text sliver. Squaring the top only (the diff body below,
	 * [data-diff], keeps its rounded bottom) removes the notch entirely —
	 * reads as a flat toolbar cap on a rounded card, not a broken corner. */
	[data-diffs-header='default'][data-sticky] {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}
	/* Pierre renders the full relative path as one plain-text node here;
	 * replaced by our own filename/directory split rendered through
	 * renderHeaderFilenameSuffix, which sits right after this in the DOM so
	 * hiding it (rather than removing/reordering) keeps the same slot order. */
	[data-diffs-header='default'] [data-title] {
		display: none;
	}
	/* Match PullRequestRow's diff-stat colors (the PR list view) instead of
	 * the shared hook's own green/red, which use a different palette. */
	[data-diffs-header='default'] [data-additions-count] {
		color: ${additionsColor};
	}
	[data-diffs-header='default'] [data-deletions-count] {
		color: ${deletionsColor};
	}
	[data-diff] {
		--diffs-light-bg: var(--background) !important;
		--diffs-dark-bg: var(--background) !important;
		border: 1px solid var(--border);
		border-top: none;
		border-bottom-left-radius: 0.75rem;
		border-bottom-right-radius: 0.75rem;
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
	}
	/* The shared hook zeroes this strip's own inline padding to sit flush
	 * with DiffPane's edge-to-edge pane — appropriate there, but it leaves
	 * "N unmodified lines" text touching this card's left border with no
	 * breathing room. Restored (higher specificity: same selector, later in
	 * the concatenated string, so this !important wins over that one). */
	[data-separator^='line-info'] [data-separator-content] {
		padding-inline: 8px !important;
	}
`;
}

// GitHub's diff-file-type vocabulary (from parsePatchFiles) mapped onto
// Pierre's tree git-status vocabulary — a distinct mapping from
// FILE_STATUS_TO_PIERRE, which targets local-filesystem status instead.
const CHANGE_TYPE_TO_PIERRE_STATUS: Record<string, PierreGitStatus> = {
	change: "modified",
	"rename-pure": "renamed",
	"rename-changed": "renamed",
	new: "added",
	deleted: "deleted",
};

interface ParsedFileDiff {
	item: CodeViewItem<PrAnnotationMetadata>;
	path: string;
	status: PierreGitStatus;
	additions: number;
	deletions: number;
}

// Left to throw on a malformed patch instead of swallowing the error —
// callers need to tell "the PR genuinely has no changes" apart from "the
// patch failed to parse", which look identical if this just returns [].
function parseFileDiffs(patch: string): ParsedFileDiff[] {
	if (!patch.trim()) return [];
	return parsePatchFiles(patch, undefined, false).flatMap((parsedPatch) =>
		parsedPatch.files.map((fileDiff, index) => {
			let additions = 0;
			let deletions = 0;
			for (const hunk of fileDiff.hunks) {
				additions += hunk.additionLines;
				deletions += hunk.deletionLines;
			}
			return {
				item: { id: `${fileDiff.name}-${index}`, type: "diff", fileDiff },
				path: fileDiff.name,
				status: CHANGE_TYPE_TO_PIERRE_STATUS[fileDiff.type] ?? "modified",
				additions,
				deletions,
			};
		}),
	);
}

function formatDiffStats(additions: number, deletions: number): string {
	if (additions === 0 && deletions === 0) return "";
	if (additions === 0) return `−${deletions}`;
	if (deletions === 0) return `+${additions}`;
	return `+${additions} −${deletions}`;
}

// Pierre's own header renders the full relative path as one string
// (data-title); the filename-first look (name in the foreground color, then
// the containing directory trailing off in the muted color) is built by
// hiding that native title and rendering our own split via
// renderHeaderFilenameSuffix instead — see prCodeTabCardUnsafeCss's
// `[data-title] { display: none }` rule.
function splitPath(path: string): { dir: string; name: string } {
	const slashIndex = path.lastIndexOf("/");
	if (slashIndex === -1) return { dir: "", name: path };
	return {
		dir: path.slice(0, slashIndex + 1),
		name: path.slice(slashIndex + 1),
	};
}

// Matches DiffPane's useDiffCommentComposer: a range spanning both an
// addition and a deletion side has no single "side" the agent prompt can
// name, so it's reported as "mixed" rather than picking one arbitrarily.
function rangeSide(
	startSide: "additions" | "deletions",
	endSide: "additions" | "deletions",
): AgentPromptFileSide {
	return startSide === endSide ? startSide : "mixed";
}

export function PullRequestCodeTab({
	projectId,
	prNumber,
	prUrl,
	hostUrl,
	hostId,
}: PullRequestCodeTabProps) {
	const { t } = useLingui();
	const { options, style } = useDiffCodeViewTheme();
	// Matches PullRequestRow's diff-stat colors exactly (text-emerald-600 /
	// [.dark_&]:text-[#34d399], text-red-600 / [.dark_&]:text-[#f87171]) so
	// the same PR reads with the same additions/deletions colors in both the
	// list and the diff viewer. Branched in JS rather than a `.dark`
	// selector in unsafeCSS — `.dark` lives on an ancestor outside Pierre's
	// shadow root, which a shadow-scoped stylesheet's descendant combinator
	// can't reach (see additionColor/deletionColor in useDiffCodeViewTheme
	// for the same pattern).
	const activeTheme = useResolvedTheme();
	const prAdditionsColor =
		activeTheme.type === "dark" ? "#34d399" : "var(--color-emerald-600)";
	const prDeletionsColor =
		activeTheme.type === "dark" ? "#f87171" : "var(--color-red-600)";
	// useDiffCodeViewTheme sources its background from the *terminal* theme
	// (terminalTheme?.background ?? var(--background)) — sensible for
	// DiffPane, which sits next to terminal panes in the workspace view, but
	// this tab has no terminal nearby and the terminal theme's default
	// background doesn't match the app's own var(--background) (e.g. a flat
	// white terminal background against this app's slightly-off-white
	// #f9f9fa page). Most visible on the CodeView root's own native
	// scrollbar, which paints against whatever background that element has.
	const codeViewStyle = useMemo(
		() => ({ ...style, backgroundColor: "var(--background)" }),
		[style],
	);
	const codeViewRef = useRef<CodeViewHandle<PrAnnotationMetadata>>(null);
	// Sourced from the same persisted setting DiffPane's toggle reads/writes
	// (options.diffStyle already carries it via useDiffCodeViewTheme) — a
	// local default here would silently override the user's saved
	// preference on first open and throw away any toggle made from this tab.
	const diffStyle = useSettings((s) => s.diffStyle);
	const updateSetting = useSettings((s) => s.update);
	const [initialTreeExpansion] = useState<"open" | "closed">(() =>
		window.innerWidth < NARROW_WINDOW_WIDTH_THRESHOLD ? "closed" : "open",
	);
	// Tracks this tab's own rendered width, not the window's — the PR list
	// pane, an app sidebar, or a split view can all make the detail pane
	// (where this tab lives) far narrower than the window, and window width
	// alone missed that entirely.
	const rootRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState<number | null>(null);
	useEffect(() => {
		const el = rootRef.current;
		if (!el) return;
		const update = () => setContainerWidth(el.getBoundingClientRect().width);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	// null = no explicit user choice yet, so the panel auto-collapses/expands
	// as the pane crosses the width threshold. Once the reviewer clicks the
	// toggle, their choice sticks regardless of further resizing — auto
	// behavior only ever supplies a default, never fights a deliberate click.
	const [manualTreeCollapsed, setManualTreeCollapsed] = useState<
		boolean | null
	>(null);
	const isTreeCollapsed =
		manualTreeCollapsed ??
		(containerWidth != null &&
			containerWidth < NARROW_PANE_WIDTH_HIDE_TREE_THRESHOLD);
	const [treeWidth, setTreeWidth] = useState(DEFAULT_TREE_WIDTH);
	const [isResizingTree, setIsResizingTree] = useState(false);
	const [composer, setComposer] = useState<ComposerState | null>(null);
	// Pierre's controlled `items` prop skips reprocessing an item whose
	// `version` is unchanged from what it last saw (see the version comment
	// on `items` below) — composer open/close/move doesn't touch
	// threadsUpdatedAt, so without this the annotation update goes stale:
	// the composer can silently fail to open, or fail to disappear on
	// cancel/Escape, whenever a thread hasn't also refetched in between.
	// Scoped to just the file(s) losing or gaining the composer annotation
	// (not every file in the diff) so a transition doesn't force Pierre to
	// reprocess the whole PR. Both refs are written synchronously inside
	// the event handler, before setComposer, so `items` sees the update on
	// the very next render — no lag.
	const composerVersionRef = useRef(0);
	const composerAffectedPathsRef = useRef<ReadonlySet<string>>(new Set());
	const updateComposer = useCallback((next: ComposerState | null) => {
		composerVersionRef.current += 1;
		setComposer((prev) => {
			const affected = new Set<string>();
			if (prev) affected.add(prev.path);
			if (next) affected.add(next.path);
			composerAffectedPathsRef.current = affected;
			return next;
		});
	}, []);
	// Cancel/Escape/successful-submit close, as opposed to updateComposer(null)
	// from onLineSelectionEnd's !range branch — there Pierre has *already*
	// cleared its own selection (that's what produced the null range), so
	// calling clearSelectedLines again would just be redundant. Mirrors
	// DiffPane's useDiffCommentComposer.clear().
	const closeComposer = useCallback(() => {
		updateComposer(null);
		codeViewRef.current?.clearSelectedLines();
	}, [updateComposer]);
	// Per-file collapse — Pierre's CodeViewDiffItem has a native `collapsed`
	// field it uses to hide a file's body while keeping its header rendered,
	// so this only needs to track *which* items are collapsed and bump their
	// version (same reasoning as composerVersionRef above: Pierre skips an
	// item whose version didn't change, and toggling collapsed doesn't touch
	// threadsUpdatedAt on its own).
	const [collapsedFileIds, setCollapsedFileIds] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const collapseVersionRef = useRef(0);
	// A single id for a per-file toggle, every id for collapse/expand-all —
	// either way, every item this set names gets the version bump below.
	const collapseAffectedIdsRef = useRef<ReadonlySet<string>>(new Set());
	const toggleFileCollapsed = useCallback((itemId: string) => {
		collapseVersionRef.current += 1;
		collapseAffectedIdsRef.current = new Set([itemId]);
		setCollapsedFileIds((prev) => {
			const next = new Set(prev);
			if (next.has(itemId)) next.delete(itemId);
			else next.add(itemId);
			return next;
		});
	}, []);
	const setAllFilesCollapsed = useCallback(
		(collapsed: boolean, allItemIds: readonly string[]) => {
			collapseVersionRef.current += 1;
			collapseAffectedIdsRef.current = new Set(allItemIds);
			setCollapsedFileIds(collapsed ? new Set(allItemIds) : new Set());
		},
		[],
	);
	const queryClient = useQueryClient();

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["pull-request-diff", projectId, hostUrl, prNumber],
		queryFn: async () => {
			const client = getHostServiceClientByUrl(hostUrl);
			return client.pullRequests.getDiff.query({ projectId, prNumber });
		},
		staleTime: 30_000,
		gcTime: 10 * 60_000,
	});

	const threadsQueryKey = [
		"pull-request-threads",
		projectId,
		hostUrl,
		prNumber,
	];
	const { data: threadsData, dataUpdatedAt: threadsUpdatedAt } = useQuery({
		queryKey: threadsQueryKey,
		queryFn: async () => {
			const client = getHostServiceClientByUrl(hostUrl);
			return client.pullRequests.getThreads.query({ projectId, prNumber });
		},
		staleTime: 30_000,
		gcTime: 10 * 60_000,
		// This tab and a workspace DiffPane for the same PR read threads
		// through two different tRPC clients with two separate caches, so
		// resolving/replying in one doesn't invalidate the other. DiffPane's
		// own threads query already self-heals via a 30s refetchInterval
		// (see useDiffAnnotations) rather than relying on cross-cache
		// invalidation — matching that here keeps the two surfaces from
		// drifting for longer than DiffPane already tolerates.
		refetchInterval: 30_000,
	});
	// getThreads degrades a GraphQL failure to an empty list rather than
	// throwing (so a comments-fetch failure doesn't block the diff view
	// itself) — fetchFailed is how it tells that apart from a PR that
	// genuinely has no threads. Surfaced as a toast, not a blocking error
	// state, since the diff is still fully usable; re-polls every 30s
	// above, so this only fires once per actual failure.
	const lastWarnedThreadsFetchedAt = useRef<number | null>(null);
	useEffect(() => {
		if (!threadsData?.fetchFailed) return;
		if (lastWarnedThreadsFetchedAt.current === threadsUpdatedAt) return;
		lastWarnedThreadsFetchedAt.current = threadsUpdatedAt;
		toast.error(
			t({
				id: "dashboard.pullRequests.codeTab.loadCommentsFailed",
				message: "Couldn't load review comments",
			}),
			{
				description: t({
					id: "dashboard.pullRequests.codeTab.loadCommentsFailedHint",
					message:
						"The diff is still up to date — only comments failed to load.",
				}),
			},
		);
	}, [threadsData?.fetchFailed, threadsUpdatedAt, t]);
	// A single useMutation instance is shared across every thread rendered
	// in the diff (one component, called once), so `.isPending`/`.variables`
	// only ever reflect the most recently *started* call — if two threads
	// are resolved/replied to before either settles, the first's row would
	// stop showing pending as soon as the second starts, even though the
	// first's request may still be in flight. Tracking pending targets in
	// their own Set (via onMutate/onSettled) keeps each thread's row correct
	// regardless of how many mutations of the same kind overlap.
	const [pendingResolveThreadIds, setPendingResolveThreadIds] = useState<
		ReadonlySet<string>
	>(new Set());
	const setThreadResolution = useMutation({
		mutationFn: async (input: { threadId: string; resolved: boolean }) => {
			const client = getHostServiceClientByUrl(hostUrl);
			return client.pullRequests.setThreadResolution.mutate(input);
		},
		onMutate: (input) => {
			setPendingResolveThreadIds((prev) => new Set(prev).add(input.threadId));
		},
		onSettled: (_data, _error, input) => {
			setPendingResolveThreadIds((prev) => {
				const next = new Set(prev);
				next.delete(input.threadId);
				return next;
			});
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: threadsQueryKey });
		},
		onError: (mutationError) => {
			toast.error(
				t({
					id: "dashboard.pullRequests.codeTab.updateThreadFailed",
					message: "Couldn't update thread",
				}),
				{
					description: errorMessage(mutationError),
				},
			);
		},
	});
	const [pendingReplyCommentIds, setPendingReplyCommentIds] = useState<
		ReadonlySet<number>
	>(new Set());
	const replyToThread = useMutation({
		mutationFn: async (input: { commentId: number; body: string }) => {
			const client = getHostServiceClientByUrl(hostUrl);
			return client.pullRequests.replyToThread.mutate({
				projectId,
				prNumber,
				...input,
			});
		},
		onMutate: (input) => {
			setPendingReplyCommentIds((prev) => new Set(prev).add(input.commentId));
		},
		onSettled: (_data, _error, input) => {
			setPendingReplyCommentIds((prev) => {
				const next = new Set(prev);
				next.delete(input.commentId);
				return next;
			});
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: threadsQueryKey });
		},
		onError: (mutationError) => {
			toast.error(
				t({
					id: "dashboard.pullRequests.codeTab.postReplyFailed",
					message: "Couldn't post reply",
				}),
				{
					description: errorMessage(mutationError),
				},
			);
		},
	});
	const linkedWorkspaceQueryKey = [
		"pull-request-linked-workspace",
		projectId,
		hostUrl,
		prNumber,
	];
	const { data: linkedWorkspaceData } = useQuery({
		queryKey: linkedWorkspaceQueryKey,
		queryFn: async () => {
			const client = getHostServiceClientByUrl(hostUrl);
			return client.pullRequests.getLinkedWorkspace.query({
				projectId,
				prNumber,
			});
		},
		staleTime: 30_000,
		gcTime: 10 * 60_000,
	});
	const linkedWorkspaceId = linkedWorkspaceData?.workspaceId ?? null;
	const { submit: submitWorkspaceCreate } = useWorkspaceCreates();

	// Mirrors DiffPane's split between "send to an existing terminal" and
	// "create a new agent session", but the PR tab has no fixed workspace to
	// launch a new session *in* — when no workspace is linked to this PR yet,
	// "new" means spinning up a whole PR-checkout workspace (via the same
	// useWorkspaceCreates path "Start Workspace" uses) with the prompt baked
	// into its first agent launch, not just a fresh terminal in one that
	// already exists.
	const sendCommentToAgent = useMutation({
		mutationFn: async (input: {
			comment: string;
			target: AgentTarget;
			path: string;
			startLine: number;
			endLine: number;
			side: AgentPromptFileSide;
		}) => {
			const text = formatAgentPromptWithFileContext({
				comment: input.comment,
				file: {
					path: input.path,
					startLine: input.startLine,
					endLine: input.endLine,
					side: input.side,
				},
			});

			if (input.target.kind === "existing") {
				if (!linkedWorkspaceId) {
					throw new Error("No workspace open for this session");
				}
				const client = getHostServiceClientByUrl(hostUrl);
				await client.terminal.writeInput.mutate({
					workspaceId: linkedWorkspaceId,
					terminalId: input.target.terminalId,
					data: normalizeTerminalCommand(sanitizePromptForPty(text)),
				});
				return;
			}

			if (linkedWorkspaceId) {
				const client = getHostServiceClientByUrl(hostUrl);
				await client.agents.run.mutate({
					workspaceId: linkedWorkspaceId,
					agent: input.target.configId,
					prompt: text,
				});
				return;
			}

			if (!hostId) {
				throw new Error("No host available to create a workspace");
			}
			const { completed } = submitWorkspaceCreate({
				hostId,
				snapshot: {
					id: crypto.randomUUID(),
					projectId,
					pr: prNumber,
					agents: [{ agent: input.target.configId, prompt: text }],
				},
			});
			const outcome = await completed;
			if (!outcome.ok) throw new Error(outcome.error);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: linkedWorkspaceQueryKey });
			toast.success(
				t({
					id: "dashboard.pullRequests.codeTab.sentToAgent",
					message: "Sent to agent",
				}),
			);
			closeComposer();
		},
		onError: (mutationError) => {
			toast.error(
				t({
					id: "dashboard.pullRequests.codeTab.sendCommentFailed",
					message: "Couldn't send comment",
				}),
				{
					description: errorMessage(mutationError),
				},
			);
		},
	});

	const annotationsByPath = useMemo(() => {
		const map = new Map<
			string,
			DiffLineAnnotation<PrCommentThreadMetadata>[]
		>();
		for (const thread of threadsData?.reviewThreads ?? []) {
			if (thread.line == null || !thread.path) continue;
			const firstCommentDbId = thread.comments[0]?.databaseId;
			const list = map.get(thread.path) ?? [];
			list.push({
				side: thread.diffSide === "LEFT" ? "deletions" : "additions",
				lineNumber: thread.line,
				metadata: {
					kind: "thread",
					threadId: thread.id,
					replyToCommentId: firstCommentDbId,
					isResolved: thread.isResolved,
					isOutdated: thread.isOutdated,
					url: firstCommentDbId
						? `${prUrl}#discussion_r${firstCommentDbId}`
						: undefined,
					comments: thread.comments.map((comment) => ({
						id: comment.id,
						authorLogin: comment.author.login,
						avatarUrl: comment.author.avatarUrl,
						body: comment.body,
						createdAt: comment.createdAt
							? new Date(comment.createdAt).getTime()
							: undefined,
					})),
				},
			});
			map.set(thread.path, list);
		}
		return map;
	}, [threadsData, prUrl]);

	const parsedPatch = useMemo(() => {
		try {
			return { files: parseFileDiffs(data?.patch ?? ""), error: null };
		} catch (err) {
			return {
				files: [] as ParsedFileDiff[],
				error: errorMessage(err, "Failed to parse diff"),
			};
		}
	}, [data?.patch]);
	const files = parsedPatch.files;
	const patchParseError = parsedPatch.error;
	const areAllFilesCollapsed =
		files.length > 0 && files.every((f) => collapsedFileIds.has(f.item.id));
	const pathByItemId = useMemo(
		() => new Map(files.map((f) => [f.item.id, f.path])),
		[files],
	);
	const composerAnnotation =
		useMemo<DiffLineAnnotation<PrDraftCommentMetadata> | null>(() => {
			if (!composer) return null;
			const endSide =
				composer.range.endSide ?? composer.range.side ?? "additions";
			const startSide = composer.range.side ?? endSide;
			return {
				side: endSide,
				lineNumber: composer.range.end,
				metadata: {
					kind: "composer",
					path: composer.path,
					startLine: composer.range.start,
					endLine: composer.range.end,
					startSide,
					endSide,
				},
			};
		}, [composer]);
	const items = useMemo<CodeViewItem<PrAnnotationMetadata>[]>(
		() =>
			files.map((f) => {
				const threadAnnotations = annotationsByPath.get(f.path) ?? [];
				const annotations =
					composerAnnotation && composer?.path === f.path
						? [...threadAnnotations, composerAnnotation]
						: threadAnnotations;
				const isVersionAffected =
					composerAffectedPathsRef.current.has(f.path) ||
					collapseAffectedIdsRef.current.has(f.item.id);
				return {
					...f.item,
					annotations: annotations.length > 0 ? annotations : undefined,
					collapsed: collapsedFileIds.has(f.item.id),
					// Pierre's controlled `items` prop diffs items by id and, per
					// its own docs ("bump the version when also changing the
					// value"), needs an explicit version bump to know an
					// already-rendered item's content changed — otherwise a
					// same-id item with new annotations (a reply landing, a
					// resolve toggling, a composer opening/closing) or a
					// collapsed toggle can go stale in the live view even though
					// the query cache/state is correct. Only the file(s) actually
					// affected get the extra bump, so a transition elsewhere
					// doesn't force Pierre to reprocess every file in the diff.
					version: isVersionAffected
						? threadsUpdatedAt +
							composerVersionRef.current +
							collapseVersionRef.current
						: threadsUpdatedAt,
				};
			}),
		// composerVersionRef.current, composerAffectedPathsRef.current,
		// collapseVersionRef.current, and collapseAffectedIdsRef.current are
		// read directly, not listed as dependencies — all are written
		// synchronously in their respective update callbacks before the
		// state setter, so they're already current by the time this
		// recomputes off the `composer`/`collapsedFileIds` change below.
		[
			files,
			annotationsByPath,
			composer,
			composerAnnotation,
			threadsUpdatedAt,
			collapsedFileIds,
		],
	);
	// Flattened in diff order (file order, then line number within a file)
	// so next/prev walks the pane top-to-bottom instead of thread-creation
	// order.
	const orderedThreads = useMemo<OrderedThread[]>(() => {
		const list: OrderedThread[] = [];
		for (const f of files) {
			const annotations = annotationsByPath.get(f.path);
			if (!annotations) continue;
			const sorted = [...annotations].sort(
				(a, b) => a.lineNumber - b.lineNumber,
			);
			for (const annotation of sorted) {
				if (!annotation.metadata) continue;
				list.push({
					threadId: annotation.metadata.threadId,
					itemId: f.item.id,
					lineNumber: annotation.lineNumber,
					side: annotation.side,
				});
			}
		}
		return list;
	}, [files, annotationsByPath]);
	// Tracked by thread id, not a raw array index — orderedThreads is
	// rebuilt from threadsData on every refetch (a background poll, an
	// unrelated resolve/reply), which can reorder or drop entries. A stored
	// index would then point at the wrong thread, or past the end of the
	// list, until the user navigated again.
	const [focusedThreadId, setFocusedThreadId] = useState<string | null>(null);
	const [focusTick, setFocusTick] = useState(0);
	const focusedThreadIndex = useMemo(() => {
		if (focusedThreadId == null) return null;
		const index = orderedThreads.findIndex(
			(t) => t.threadId === focusedThreadId,
		);
		return index === -1 ? null : index;
	}, [orderedThreads, focusedThreadId]);

	const jumpToThread = (index: number) => {
		const target = orderedThreads[index];
		if (!target) return;
		setFocusedThreadId(target.threadId);
		setFocusTick(Date.now());
		codeViewRef.current?.scrollTo({
			type: "line",
			id: target.itemId,
			lineNumber: target.lineNumber,
			side: target.side,
			align: "center",
			behavior: "smooth-auto",
		});
	};
	const goToNextComment = () => {
		if (orderedThreads.length === 0) return;
		jumpToThread(
			focusedThreadIndex == null
				? 0
				: (focusedThreadIndex + 1) % orderedThreads.length,
		);
	};
	const goToPrevComment = () => {
		if (orderedThreads.length === 0) return;
		jumpToThread(
			focusedThreadIndex == null
				? orderedThreads.length - 1
				: (focusedThreadIndex - 1 + orderedThreads.length) %
						orderedThreads.length,
		);
	};

	const codeViewOptions = useMemo(
		() =>
			({
				...options,
				// A visible gap between files is what makes the rounded
				// header/diff pair (prCodeTabCardUnsafeCss) read as
				// separate cards rather than one continuous, oddly-cornered
				// block — DiffPane's own gap: 0 doesn't need this since it
				// has no such per-file card styling.
				layout: { ...options.layout, gap: 16 },
				unsafeCSS: `${options.unsafeCSS ?? ""}\n${prCodeTabCardUnsafeCss(prAdditionsColor, prDeletionsColor)}`,
				enableLineSelection: true,
				enableGutterUtility: true,
				// Pierre gates the gutter "+" button's pointer flow behind a
				// non-null onGutterUtilityClick (InteractionManager's
				// startGutterSelectionFromPointerDown early-returns otherwise)
				// — the real open logic lives in onLineSelectionEnd, which also
				// fires on gutter clicks. Mirrors the v2-workspace DiffPane's
				// identical stub for the same reason.
				onGutterUtilityClick: () => {},
				onLineSelectionEnd: (
					range: SelectedLineRange | null,
					context: { type: "diff" | "file"; item: { id: string } },
				) => {
					if (context.type !== "diff" || !range) {
						updateComposer(null);
						return;
					}
					const path = pathByItemId.get(context.item.id);
					if (!path) return;
					updateComposer({ itemId: context.item.id, path, range });
				},
			}) as CodeViewOptions<PrAnnotationMetadata>,
		[options, pathByItemId, updateComposer, prAdditionsColor, prDeletionsColor],
	);

	const treePaths = useMemo(() => files.map((f) => f.path), [files]);
	const fileByPath = useMemo(
		() => new Map(files.map((f) => [f.path, f])),
		[files],
	);
	const gitStatus = useMemo(
		() => files.map((f) => ({ path: f.path, status: f.status })),
		[files],
	);
	const itemIdByPath = useMemo(
		() => new Map(files.map((f) => [f.path, f.item.id])),
		[files],
	);

	// Routed through a ref so Pierre's handler closures (resolved once at
	// useFileTree time) always see the latest data.
	const handlersRef = useRef({
		onSelect(_path: string) {},
		renderRowDecoration(_ctx: { item: { kind: string; path: string } }) {
			return null as { text: string } | null;
		},
	});
	handlersRef.current.onSelect = (path) => {
		const itemId = itemIdByPath.get(path);
		if (!itemId) return;
		codeViewRef.current?.scrollTo({
			type: "item",
			id: itemId,
			align: "start",
			behavior: "smooth-auto",
		});
	};
	handlersRef.current.renderRowDecoration = (ctx) => {
		if (ctx.item.kind === "directory") return null;
		const file = fileByPath.get(ctx.item.path);
		if (!file) return null;
		const text = formatDiffStats(file.additions, file.deletions);
		return text ? { text } : null;
	};

	const { model } = useFileTree({
		paths: treePaths,
		initialExpansion: initialTreeExpansion,
		search: false,
		unsafeCSS: PIERRE_TREE_UNSAFE_CSS,
		gitStatus,
		icons: { set: "complete", colored: true },
		itemHeight: ITEM_HEIGHT,
		overscan: 20,
		stickyFolders: true,
		flattenEmptyDirectories: true,
		onSelectionChange: (selected) => {
			const last = selected[selected.length - 1];
			if (!last || last.endsWith("/")) return;
			handlersRef.current.onSelect(last);
		},
		renderRowDecoration: (ctx) => handlersRef.current.renderRowDecoration(ctx),
	});

	useEffect(() => {
		model.resetPaths(treePaths);
	}, [model, treePaths]);

	useEffect(() => {
		model.setGitStatus(gitStatus);
	}, [model, gitStatus]);

	if (isLoading) {
		return (
			<div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
				<div className="flex flex-1 items-center justify-center">
					<WorkItemDetailState
						message={t({
							id: "dashboard.pullRequests.codeTab.loadingDiff",
							message: "Loading diff…",
						})}
						isLoading
					/>
				</div>
			</div>
		);
	}

	if (error instanceof Error) {
		return (
			<div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
				<div className="flex flex-1 items-center justify-center">
					<WorkItemDetailState
						message={error.message}
						isError
						onRetry={() => void refetch()}
					/>
				</div>
			</div>
		);
	}

	if (patchParseError) {
		return (
			<div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
				<div className="flex flex-1 items-center justify-center">
					<WorkItemDetailState
						message={t({
							id: "dashboard.pullRequests.codeTab.parseDiffFailed",
							message: `Couldn't parse this diff: ${patchParseError}`,
						})}
						isError
						onRetry={() => void refetch()}
					/>
				</div>
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
				<div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
					<Trans id="dashboard.pullRequests.codeTab.noChanges">
						No changes to display.
					</Trans>
				</div>
			</div>
		);
	}

	const toggleClass = (active: boolean) =>
		cn(
			"flex size-5 items-center justify-center rounded transition-colors",
			active
				? "bg-secondary text-foreground"
				: "text-muted-foreground hover:text-foreground",
		);

	return (
		<div
			ref={rootRef}
			className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3 @md:px-6"
		>
			<div className="flex min-h-0 flex-1 overflow-hidden">
				{!isTreeCollapsed && (
					<ResizablePanel
						width={treeWidth}
						onWidthChange={setTreeWidth}
						isResizing={isResizingTree}
						onResizingChange={setIsResizingTree}
						minWidth={MIN_TREE_WIDTH}
						maxWidth={MAX_TREE_WIDTH}
						handleSide="right"
						onDoubleClickHandle={() => setTreeWidth(DEFAULT_TREE_WIDTH)}
						className="flex flex-col"
					>
						<PierreFileTree
							model={model}
							style={{ ...TREE_STYLE, height: "100%" }}
						/>
					</ResizablePanel>
				)}
				<div className="flex min-h-0 flex-1 flex-col">
					<div className="flex shrink-0 items-center justify-between gap-1 border-b border-border/20 px-2 py-1.5">
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => setManualTreeCollapsed(!isTreeCollapsed)}
								aria-label={
									isTreeCollapsed
										? t({
												id: "dashboard.pullRequests.codeTab.showFileTree",
												message: "Show file tree",
											})
										: t({
												id: "dashboard.pullRequests.codeTab.hideFileTree",
												message: "Hide file tree",
											})
								}
								className="flex items-center gap-1.5 rounded-md bg-fill-hover px-1.5 py-1 text-muted-foreground transition-colors hover:bg-fill-selected hover:text-foreground"
							>
								<LuFiles className="size-3.5 shrink-0" strokeWidth={1.5} />
								<span className="text-[11px] font-medium">
									<Trans id="dashboard.pullRequests.codeTab.files">Files</Trans>
								</span>
								<span className="text-[11px] tabular-nums text-muted-foreground/70">
									{files.length}
								</span>
							</button>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={() =>
											setAllFilesCollapsed(
												!areAllFilesCollapsed,
												files.map((f) => f.item.id),
											)
										}
										aria-label={
											areAllFilesCollapsed
												? t({
														id: "dashboard.pullRequests.codeTab.expandAllFiles",
														message: "Expand all files",
													})
												: t({
														id: "dashboard.pullRequests.codeTab.collapseAllFiles",
														message: "Collapse all files",
													})
										}
										className="flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
									>
										{areAllFilesCollapsed ? (
											<LuUnfoldVertical
												className="size-3.5"
												strokeWidth={1.5}
											/>
										) : (
											<LuFoldVertical className="size-3.5" strokeWidth={1.5} />
										)}
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									{areAllFilesCollapsed ? (
										<Trans id="dashboard.pullRequests.codeTab.expandAllFiles">
											Expand all files
										</Trans>
									) : (
										<Trans id="dashboard.pullRequests.codeTab.collapseAllFiles">
											Collapse all files
										</Trans>
									)}
								</TooltipContent>
							</Tooltip>
						</div>
						<div className="flex items-center gap-1">
							{orderedThreads.length > 0 && (
								<>
									<div className="flex items-center gap-0.5 rounded-md bg-muted/50 px-1 py-0.5">
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={goToPrevComment}
													aria-label={t({
														id: "dashboard.pullRequests.codeTab.previousComment",
														message: "Previous comment",
													})}
													className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
												>
													<LuChevronUp className="size-3.5" strokeWidth={1.5} />
												</button>
											</TooltipTrigger>
											<TooltipContent side="bottom">
												<Trans id="dashboard.pullRequests.codeTab.previousComment">
													Previous comment
												</Trans>
											</TooltipContent>
										</Tooltip>
										<span className="min-w-[3ch] text-center text-[11px] tabular-nums text-muted-foreground">
											{focusedThreadIndex != null
												? focusedThreadIndex + 1
												: "–"}
											/{orderedThreads.length}
										</span>
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={goToNextComment}
													aria-label={t({
														id: "dashboard.pullRequests.codeTab.nextComment",
														message: "Next comment",
													})}
													className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
												>
													<LuChevronDown
														className="size-3.5"
														strokeWidth={1.5}
													/>
												</button>
											</TooltipTrigger>
											<TooltipContent side="bottom">
												<Trans id="dashboard.pullRequests.codeTab.nextComment">
													Next comment
												</Trans>
											</TooltipContent>
										</Tooltip>
									</div>
									<div className="mx-0.5 h-4 w-px bg-border" />
								</>
							)}
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={() => updateSetting("diffStyle", "unified")}
										aria-label={t({
											id: "dashboard.pullRequests.codeTab.unifiedView",
											message: "Unified view",
										})}
										aria-pressed={diffStyle === "unified"}
										className={toggleClass(diffStyle === "unified")}
									>
										<LuRows2 className="size-3.5" />
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									<Trans id="dashboard.pullRequests.codeTab.unifiedView">
										Unified view
									</Trans>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={() => updateSetting("diffStyle", "split")}
										aria-label={t({
											id: "dashboard.pullRequests.codeTab.splitView",
											message: "Split view",
										})}
										aria-pressed={diffStyle === "split"}
										className={toggleClass(diffStyle === "split")}
									>
										<LuColumns2 className="size-3.5" />
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									<Trans id="dashboard.pullRequests.codeTab.splitView">
										Split view
									</Trans>
								</TooltipContent>
							</Tooltip>
						</div>
					</div>
					<CodeView
						ref={codeViewRef}
						className="min-h-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain [overflow-anchor:none]"
						style={codeViewStyle}
						items={items}
						options={codeViewOptions}
						renderHeaderPrefix={(item) => {
							const isCollapsed = collapsedFileIds.has(item.id);
							return (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										toggleFileCollapsed(item.id);
									}}
									aria-label={
										isCollapsed
											? t({
													id: "dashboard.pullRequests.codeTab.expandFile",
													message: "Expand file",
												})
											: t({
													id: "dashboard.pullRequests.codeTab.collapseFile",
													message: "Collapse file",
												})
									}
									className="flex size-4 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
								>
									<LuChevronRight
										className={cn(
											"size-3 shrink-0 transition-transform",
											!isCollapsed && "rotate-90",
										)}
										strokeWidth={1.5}
									/>
								</button>
							);
						}}
						renderHeaderFilenameSuffix={(item) => {
							const path = pathByItemId.get(item.id);
							if (!path) return null;
							const { dir, name } = splitPath(path);
							return (
								<span className="flex min-w-0 items-center gap-1.5">
									<span className="shrink-0 text-foreground">{name}</span>
									{dir && (
										<span
											className="min-w-0 truncate text-muted-foreground/70"
											title={dir}
										>
											{dir}
										</span>
									)}
								</span>
							);
						}}
						renderAnnotation={(annotation) => {
							const metadata = annotation.metadata;
							if (!metadata) return null;
							if (metadata.kind === "composer") {
								return (
									<PullRequestCommentComposer
										// Keyed on the target so re-selecting a different
										// line/file while the composer is already open
										// remounts it instead of possibly carrying over a
										// draft or in-flight submitting state from the
										// previous target.
										key={`${metadata.path}:${metadata.startLine}-${metadata.endLine}`}
										contextLabel={
											metadata.startLine === metadata.endLine
												? t({
														id: "dashboard.pullRequests.codeTab.lineContext",
														message: `Line ${metadata.startLine}`,
													})
												: t({
														id: "dashboard.pullRequests.codeTab.linesContext",
														message: `Lines ${metadata.startLine}–${metadata.endLine}`,
													})
										}
										hostUrl={hostUrl}
										linkedWorkspaceId={linkedWorkspaceId}
										onCancel={closeComposer}
										onSubmit={async ({ comment, target }) => {
											await sendCommentToAgent.mutateAsync({
												comment,
												target,
												path: metadata.path,
												startLine: metadata.startLine,
												endLine: metadata.endLine,
												side: rangeSide(metadata.startSide, metadata.endSide),
											});
										}}
									/>
								);
							}
							const isFocused =
								focusedThreadIndex != null &&
								orderedThreads[focusedThreadIndex]?.threadId ===
									metadata.threadId;
							return (
								<PullRequestCommentThread
									isResolved={metadata.isResolved}
									isOutdated={metadata.isOutdated}
									url={metadata.url}
									comments={metadata.comments}
									onResolveChange={(resolved) =>
										setThreadResolution.mutate({
											threadId: metadata.threadId,
											resolved,
										})
									}
									isResolvePending={pendingResolveThreadIds.has(
										metadata.threadId,
									)}
									onReply={(body) => {
										const commentId = metadata.replyToCommentId;
										if (!commentId) return false;
										replyToThread.mutate({ commentId, body });
										return true;
									}}
									isReplyPending={
										metadata.replyToCommentId != null &&
										pendingReplyCommentIds.has(metadata.replyToCommentId)
									}
									focusTick={isFocused ? focusTick : undefined}
								/>
							);
						}}
					/>
				</div>
			</div>
		</div>
	);
}
