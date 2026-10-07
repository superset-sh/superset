import { Trans, useLingui } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { Input } from "@superset/ui/input";
import { Plus, Search } from "lucide-react";
import { type MouseEvent, type ReactNode, useCallback, useState } from "react";
import { env } from "renderer/env.renderer";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { usePagePolicy } from "renderer/lib/clickPolicy";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { usePagesList } from "renderer/routes/_authenticated/_dashboard/hooks/usePagesList";
import { useStore } from "zustand";
import { NewPageComposer } from "../../../../components/NewPageComposer";
import type { CreateNewAgentSession } from "../../../../hooks/useAgentSessionLauncher";
import type { PagePaneData, PaneViewerData } from "../../../../types";
import { openBesidePane } from "../../../../utils/openBesidePane";
import { PagesListCard, type PagesListItem } from "./components/PagesListCard";

const WORKSPACE_PAGE_LIMIT = 200;

type PagesQuery = ReturnType<typeof usePagesList>;

interface PagesListPaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	onCreateNewAgentSession: CreateNewAgentSession;
	onFocusAgentTerminal: (terminalId: string) => void;
}

export function PagesListPane({
	context,
	workspaceId,
	onCreateNewAgentSession,
	onFocusAgentTerminal,
}: PagesListPaneProps) {
	const { t } = useLingui();
	const { store } = context;
	const paneId = context.pane.id;
	const tabId = context.tab.id;
	const pagePolicy = usePagePolicy("4-tier");
	const [search, setSearch] = useState("");
	const [composing, setComposing] = useState(false);
	const debouncedSearch = useDebouncedValue(search.trim(), 200) || undefined;

	const workspacePages = usePagesList(
		{ workspaceId, search: debouncedSearch, limit: WORKSPACE_PAGE_LIMIT },
		{ staleTime: 60_000 },
	);
	const allPages = usePagesList(
		{ search: debouncedSearch },
		{ staleTime: 60_000 },
	);
	const workspacePageIds = new Set(workspacePages.items.map((page) => page.id));
	const otherPages = allPages.items.filter(
		(page) => !workspacePageIds.has(page.id),
	);
	const allPagesInWorkspace =
		otherPages.length === 0 &&
		allPages.items.length > 0 &&
		!allPages.hasNextPage;

	const activePageId = useStore(store, (state) => {
		const tab = state.getTab(tabId);
		const active = tab?.activePaneId ? tab.panes[tab.activePaneId] : undefined;
		return active?.kind === "page"
			? (active.data as PagePaneData).pageId
			: undefined;
	});

	const handleOpen = useCallback(
		(page: PagesListItem, event: MouseEvent) => {
			const action = pagePolicy.getAction(event) ?? "pane";
			if (action === "external") {
				const url = new URL(
					`/page/${encodeURIComponent(page.slug)}`,
					env.NEXT_PUBLIC_WEB_URL,
				).toString();
				electronTrpcClient.external.openUrl.mutate(url).catch((error) => {
					console.error("[PagesListPane] Failed to open page:", url, error);
				});
				return;
			}
			const pagePane = {
				kind: "page",
				data: {
					pageId: page.id,
					slug: page.slug,
					title: page.title,
				} as PagePaneData,
			} as const;
			const state = store.getState();
			if (action === "newTab") {
				openBesidePane(store, paneId, pagePane, true);
				return;
			}
			if (state.getTab(tabId)?.panes[paneId]?.pinned) {
				openBesidePane(store, paneId, pagePane);
				return;
			}
			state.replacePane({ tabId, paneId, newPane: pagePane });
		},
		[pagePolicy, store, tabId, paneId],
	);

	const cards = (pages: PagesListItem[]) => (
		<div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 px-1">
			{pages.map((page) => (
				<PagesListCard
					key={page.id}
					page={page}
					isActive={page.id === activePageId}
					onOpen={handleOpen}
				/>
			))}
		</div>
	);

	const emptyRow = (message: ReactNode) => (
		<div className="px-2 py-1.5 text-xs text-muted-foreground/70">
			{message}
		</div>
	);
	const emptyMessage = debouncedSearch ? (
		<Trans>No matching pages</Trans>
	) : (
		<Trans>No pages yet</Trans>
	);
	const retryButton = (onRetry: () => void) => (
		<button
			type="button"
			onClick={onRetry}
			className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
		>
			<Trans>Try again</Trans>
		</button>
	);
	const sectionBody = (query: PagesQuery, pages: PagesListItem[]) => (
		<>
			{pages.length > 0 ? (
				cards(pages)
			) : query.isError && query.items.length === 0 ? (
				<div className="flex items-center justify-between">
					{emptyRow(<Trans>Couldn't load pages</Trans>)}
					{retryButton(() => void query.refetch())}
				</div>
			) : query.isLoading ||
				(query.hasNextPage && !query.isFetchNextPageError) ? (
				emptyRow(<Trans>Loading…</Trans>)
			) : (
				emptyRow(emptyMessage)
			)}
			{query.items.length > 0 &&
				query.isFetchNextPageError &&
				retryButton(() => void query.fetchNextPage())}
			<div ref={query.sentinelRef} />
		</>
	);

	return (
		<div className="flex h-full min-h-0 w-full flex-col">
			<div className="relative shrink-0 p-2">
				<Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder={t({ message: "Search pages" })}
					className="h-8 w-full pl-7 text-xs"
				/>
			</div>
			{composing && (
				<div className="mx-2 mb-1 shrink-0 rounded-md border border-border/60 bg-muted/20">
					<NewPageComposer
						workspaceId={workspaceId}
						onSent={() => setComposing(false)}
						onCancel={() => setComposing(false)}
						onCreateNewAgentSession={onCreateNewAgentSession}
						onFocusAgentTerminal={onFocusAgentTerminal}
					/>
				</div>
			)}
			<div
				ref={(node) => {
					workspacePages.scrollRef.current = node;
					allPages.scrollRef.current = node;
				}}
				className="min-h-0 flex-1 overflow-y-auto px-1 pb-2"
			>
				<section className="py-1">
					<div className="flex h-7 items-center justify-between pr-1 pl-2 text-[11px] font-medium text-muted-foreground">
						<Trans>This workspace</Trans>
						<button
							type="button"
							aria-label={t({ message: "New page" })}
							title={t({ message: "New page" })}
							aria-pressed={composing}
							onClick={() => setComposing((value) => !value)}
							className="flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent aria-pressed:bg-accent aria-pressed:text-foreground"
						>
							<Plus className="size-3.5" />
						</button>
					</div>
					{sectionBody(workspacePages, workspacePages.items)}
				</section>
				{!allPagesInWorkspace && (
					<section className="py-1">
						<div className="flex h-7 items-center px-2 text-[11px] font-medium text-muted-foreground">
							<Trans>All pages</Trans>
						</div>
						{sectionBody(allPages, otherPages)}
					</section>
				)}
			</div>
		</div>
	);
}
