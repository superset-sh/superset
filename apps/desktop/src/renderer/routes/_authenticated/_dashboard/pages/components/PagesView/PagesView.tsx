import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LuSearch } from "react-icons/lu";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { FeatureHeader } from "renderer/routes/_authenticated/_dashboard/components/FeatureHeader";
import { LoadMoreSentinel } from "renderer/routes/_authenticated/_dashboard/components/LoadMoreSentinel";
import { useDebouncedSearchNavigation } from "renderer/routes/_authenticated/_dashboard/hooks/useDebouncedSearchNavigation";
import { usePageFavorites } from "renderer/routes/_authenticated/_dashboard/hooks/usePageFavorites";
import { usePagesList } from "renderer/routes/_authenticated/_dashboard/hooks/usePagesList";
import { pagesListInput } from "renderer/routes/_authenticated/_dashboard/utils/pagesListInput";
import { usePageWorkspaceNames } from "../../hooks/usePageWorkspaceNames";
import { type PageScope, serverScope } from "../../utils/pageScope";
import { PagesGrid } from "../PagesGrid";
import { AuthorFilter, type PageAuthorOption } from "./components/AuthorFilter";
import {
	type PageWorkspaceOption,
	WorkspaceFilter,
} from "./components/WorkspaceFilter";
import { useCreatePageWithAgent } from "./hooks/useCreatePageWithAgent";

const TABS: Array<{ value: PageScope }> = [
	{ value: "all" },
	{ value: "pinned" },
	{ value: "team" },
	{ value: "mine" },
];

interface PagesViewProps {
	search: string;
	scope: PageScope;
	authorId: string | null;
	workspaceId: string | null;
	onSearchChange: (search: string) => void;
	onScopeChange: (scope: PageScope) => void;
	onAuthorChange: (authorId: string | null) => void;
	onWorkspaceChange: (workspaceId: string | null) => void;
	onOpenPage: (page: { slug: string }) => void;
}

export function PagesView({
	search,
	scope,
	authorId,
	workspaceId,
	onSearchChange,
	onScopeChange,
	onAuthorChange,
	onWorkspaceChange,
	onOpenPage,
}: PagesViewProps) {
	const { t } = useLingui();
	const { creatingWithAgent, handleCreateWithAgent } = useCreatePageWithAgent();
	const { data: session } = authClient.useSession();
	const utils = cloudTrpc.useUtils();
	const { favoritePageIds, favoritePageIdSet, toggleFavorite } =
		usePageFavorites();

	// The input answers the keystroke; the URL — and so the query — settles.
	//
	// A pending search is deliberately never cancelled when another filter
	// changes: every handler here updates the URL through a functional updater,
	// so a search landing after a scope change composes with it instead of
	// clobbering it. Cancelling would strand the typed text in the box while the
	// grid stayed unfiltered.
	const [searchInput, setSearchInput] = useState(search);
	useEffect(() => setSearchInput(search), [search]);
	const { scheduleSearchNavigation } =
		useDebouncedSearchNavigation(onSearchChange);
	const handleSearchChange = useCallback(
		(value: string) => {
			setSearchInput(value);
			scheduleSearchNavigation(value);
		},
		[scheduleSearchNavigation],
	);

	const filter = useMemo(
		() => ({
			...(search ? { search } : {}),
			scope: serverScope(scope),
			...(authorId ? { authorId } : {}),
			...(workspaceId ? { workspaceId } : {}),
			...(scope === "pinned" ? { ids: favoritePageIds } : {}),
		}),
		[search, scope, authorId, workspaceId, favoritePageIds],
	);

	const pages = usePagesList(filter);
	const { items, hasNextPage, isFetchingNextPage, scrollRef, sentinelRef } =
		pages;

	const countsQuery = cloudTrpc.page.counts.useQuery({
		...(search ? { search } : {}),
		...(authorId ? { authorId } : {}),
		...(workspaceId ? { workspaceId } : {}),
		pinnedIds: favoritePageIds,
	});
	const counts = useMemo(
		() => ({
			all: countsQuery.data?.all ?? 0,
			pinned: countsQuery.data?.pinned ?? 0,
			team: countsQuery.data?.team ?? 0,
			mine: countsQuery.data?.mine ?? 0,
		}),
		[countsQuery.data],
	);

	const listInput = useMemo(() => pagesListInput(filter), [filter]);
	const deletePage = cloudTrpc.page.delete.useMutation({
		onMutate: async ({ id }) => {
			await utils.page.listPaginated.cancel(listInput);
			const previous = utils.page.listPaginated.getInfiniteData(listInput);
			utils.page.listPaginated.setInfiniteData(listInput, (old) =>
				old
					? {
							...old,
							pages: old.pages.map((page) => ({
								...page,
								items: page.items.filter((entry) => entry.id !== id),
							})),
						}
					: old,
			);
			return { previous };
		},
		onError: (_error, _variables, context) => {
			if (context?.previous) {
				utils.page.listPaginated.setInfiniteData(listInput, context.previous);
			}
		},
		onSettled: () => {
			void utils.page.listPaginated.invalidate(listInput);
			void utils.page.counts.invalidate();
		},
	});

	const tabLabels: Record<PageScope, string> = {
		all: t({ message: "All" }),
		pinned: t({ message: "Pinned" }),
		team: t({ message: "Team" }),
		mine: t({ message: "Just me" }),
	};

	const currentUserId = session?.user.id;
	const authorOptions = useMemo<PageAuthorOption[]>(() => {
		const rows = countsQuery.data?.authors ?? [];
		return rows
			.flatMap((row) =>
				row.userId
					? [
							{
								userId: row.userId,
								name: row.name || t({ message: "Unknown" }),
								image: row.image,
								isCurrentUser: row.userId === currentUserId,
							},
						]
					: [],
			)
			.sort((a, b) => {
				if (a.isCurrentUser !== b.isCurrentUser)
					return a.isCurrentUser ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
	}, [countsQuery.data, currentUserId, t]);

	const workspaceNames = usePageWorkspaceNames();
	const workspaceOptions = useMemo<PageWorkspaceOption[]>(
		() =>
			(countsQuery.data?.workspaces ?? [])
				.filter((row) => workspaceNames.has(row.workspaceId))
				.map((row) => ({
					workspaceId: row.workspaceId,
					name: workspaceNames.get(row.workspaceId) ?? row.workspaceId,
					count: row.count,
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[countsQuery.data, workspaceNames],
	);

	const tabs = useMemo(
		() =>
			TABS.filter(
				(tab) =>
					tab.value !== "pinned" || counts.pinned > 0 || scope === "pinned",
			),
		[counts.pinned, scope],
	);

	const hasFilters =
		Boolean(search.trim()) ||
		scope !== "all" ||
		authorId !== null ||
		workspaceId !== null;
	// From the list, not the counts: those arrive on their own query, and a
	// zero default while they are in flight would blank a loaded grid.
	const orgEmpty =
		!hasFilters && !pages.isPending && !pages.error && items.length === 0;

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<div className="drag h-10 shrink-0" />

			<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-8 pb-12">
					<FeatureHeader
						title={<Trans>Pages</Trans>}
						docsUrl={`${COMPANY.DOCS_URL}/pages`}
						onCreate={handleCreateWithAgent}
						isCreating={creatingWithAgent}
					/>

					<div className="mt-6 flex flex-wrap items-center justify-between gap-2">
						<Tabs
							value={scope}
							onValueChange={(value) => onScopeChange(value as PageScope)}
						>
							<TabsList className="h-8 gap-1 bg-transparent p-0">
								{tabs.map((tab) => (
									<TabsTrigger
										key={tab.value}
										value={tab.value}
										className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
									>
										<span className="text-sm">{tabLabels[tab.value]}</span>
										{!orgEmpty && (
											<span className="ml-1 text-muted-foreground text-xs tabular-nums">
												{counts[tab.value]}
											</span>
										)}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>

						<div className="flex items-center gap-2">
							{(workspaceOptions.length > 0 || workspaceId !== null) && (
								<WorkspaceFilter
									value={workspaceId}
									options={workspaceOptions}
									onChange={onWorkspaceChange}
								/>
							)}
							{(authorOptions.length > 1 || authorId !== null) && (
								<AuthorFilter
									value={authorId}
									options={authorOptions}
									onChange={onAuthorChange}
								/>
							)}
							<div className="relative w-56">
								<LuSearch className="-translate-y-1/2 absolute top-1/2 left-2 size-3.5 text-muted-foreground" />
								<Input
									value={searchInput}
									onChange={(event) => handleSearchChange(event.target.value)}
									placeholder={t({
										message: "Search pages",
									})}
									className="h-8 pl-7 text-sm"
								/>
							</div>
						</div>
					</div>

					<PagesGrid
						pages={items}
						onCreate={handleCreateWithAgent}
						isCreating={creatingWithAgent}
						pinnedPageIds={favoritePageIdSet}
						currentUserId={session?.user.id}
						isPending={pages.isPending}
						error={items.length === 0 ? pages.error?.message : undefined}
						hasFilters={!orgEmpty && hasFilters}
						onOpen={onOpenPage}
						onTogglePin={toggleFavorite}
						onDelete={async (pageId) => {
							await deletePage.mutateAsync({ id: pageId });
							toast.success(
								t({
									message: "Page deleted",
								}),
							);
						}}
					/>

					<LoadMoreSentinel
						sentinelRef={sentinelRef}
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
					/>
				</div>
			</div>
		</div>
	);
}
