import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useEffect, useMemo } from "react";
import { LuSearch } from "react-icons/lu";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { FeatureHeader } from "renderer/routes/_authenticated/_dashboard/components/FeatureHeader";
import { useAllPages } from "renderer/routes/_authenticated/_dashboard/hooks/useAllPages";
import {
	isPaneModifier,
	useOpenPage,
} from "renderer/routes/_authenticated/_dashboard/hooks/useOpenPage";
import { usePageFavorites } from "renderer/routes/_authenticated/_dashboard/hooks/usePageFavorites";
import { pagesListInput } from "renderer/routes/_authenticated/_dashboard/utils/pagesListInput";
import { useAccessibleV2Workspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	filterPages,
	matchesScope,
	type PageScope,
	sortPinnedFirst,
} from "../../utils/filterPages";
import { PagesGrid } from "../PagesGrid";
import { AuthorFilter, type PageAuthorOption } from "./components/AuthorFilter";
import {
	type PageWorkspaceOption,
	WorkspaceFilter,
} from "./components/WorkspaceFilter";
import { useCreatePageWithAgent } from "./hooks/useCreatePageWithAgent";

const PAGES_QUERY = pagesListInput();

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
}: PagesViewProps) {
	const { t } = useLingui();
	const { creatingWithAgent, handleCreateWithAgent } = useCreatePageWithAgent();
	const { data: session } = authClient.useSession();
	const utils = cloudTrpc.useUtils();
	const pages = useAllPages();
	const { hasNextPage, isFetchNextPageError, fetchNextPage } = pages;

	const deletePage = cloudTrpc.page.delete.useMutation({
		onMutate: async ({ id }) => {
			await utils.page.list.cancel(PAGES_QUERY);
			const previous = utils.page.list.getInfiniteData(PAGES_QUERY);
			utils.page.list.setInfiniteData(PAGES_QUERY, (old) =>
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
				utils.page.list.setInfiniteData(PAGES_QUERY, context.previous);
			}
		},
		onSettled: () => {
			void utils.page.list.invalidate(PAGES_QUERY);
		},
	});
	const { favoritePageIdSet, toggleFavorite } = usePageFavorites();
	const openPage = useOpenPage();

	const tabLabels: Record<PageScope, string> = {
		all: t({ message: "All" }),
		pinned: t({ message: "Pinned" }),
		team: t({ message: "Team" }),
		mine: t({ message: "Just me" }),
	};

	const all = pages.items;

	const currentUserId = session?.user.id;
	const authorOptions = useMemo<PageAuthorOption[]>(() => {
		const byAuthor = new Map<string, PageAuthorOption>();
		for (const page of all) {
			if (!page.createdByUserId || byAuthor.has(page.createdByUserId)) {
				continue;
			}
			byAuthor.set(page.createdByUserId, {
				userId: page.createdByUserId,
				name:
					page.ownerName ||
					t({
						message: "Unknown",
					}),
				image: page.ownerImage,
				isCurrentUser: page.createdByUserId === currentUserId,
			});
		}
		return Array.from(byAuthor.values()).sort((a, b) => {
			if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	}, [all, currentUserId, t]);

	const { all: accessibleWorkspaces } = useAccessibleV2Workspaces();
	const workspaceOptions = useMemo<PageWorkspaceOption[]>(() => {
		const names = new Map(
			accessibleWorkspaces.map((workspace) => [workspace.id, workspace.name]),
		);
		const counts = new Map<string, number>();
		for (const page of all) {
			for (const link of page.workspaceLinks ?? []) {
				counts.set(link.workspaceId, (counts.get(link.workspaceId) ?? 0) + 1);
			}
		}
		return Array.from(counts.entries())
			.filter(([id]) => names.has(id))
			.map(([id, count]) => ({
				workspaceId: id,
				name: names.get(id) ?? id,
				count,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [all, accessibleWorkspaces]);

	const counts = useMemo(
		() => ({
			all: all.length,
			pinned: all.filter((page) => favoritePageIdSet.has(page.id)).length,
			team: all.filter((page) => matchesScope(page, "team", favoritePageIdSet))
				.length,
			mine: all.filter((page) => matchesScope(page, "mine", favoritePageIdSet))
				.length,
		}),
		[all, favoritePageIdSet],
	);

	const tabs = useMemo(
		() =>
			TABS.filter(
				(tab) =>
					tab.value !== "pinned" || counts.pinned > 0 || scope === "pinned",
			),
		[counts.pinned, scope],
	);

	const pinnedEmpty =
		pages.data !== undefined &&
		!hasNextPage &&
		scope === "pinned" &&
		counts.pinned === 0;
	const activeScope = pinnedEmpty ? "all" : scope;

	useEffect(() => {
		if (pinnedEmpty) onScopeChange("all");
	}, [pinnedEmpty, onScopeChange]);

	const visible = useMemo(
		() =>
			sortPinnedFirst(
				filterPages(all, {
					search,
					scope: activeScope,
					pinnedPageIds: favoritePageIdSet,
					authorId,
					workspaceId,
				}),
				favoritePageIdSet,
			),
		[all, search, activeScope, favoritePageIdSet, authorId, workspaceId],
	);

	const orgEmpty = !pages.isPending && !pages.error && all.length === 0;

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<div className="drag h-10 shrink-0" />

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-8 pb-12">
					<FeatureHeader
						title={<Trans>Pages</Trans>}
						docsUrl={`${COMPANY.DOCS_URL}/pages`}
						onCreate={handleCreateWithAgent}
						isCreating={creatingWithAgent}
						showCreate={!orgEmpty}
					/>

					{!orgEmpty && (
						<div className="mt-6 flex flex-wrap items-center justify-between gap-2">
							<Tabs
								value={activeScope}
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
											<span className="ml-1 text-muted-foreground text-xs tabular-nums">
												{counts[tab.value]}
											</span>
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
										value={search}
										onChange={(event) => onSearchChange(event.target.value)}
										placeholder={t({
											message: "Search pages",
										})}
										className="h-8 pl-7 text-sm"
									/>
								</div>
							</div>
						</div>
					)}

					{isFetchNextPageError && all.length > 0 && (
						<div className="mt-4 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-1.5 text-destructive text-xs">
							<span className="flex-1">
								<Trans>
									Some pages couldn't load, so this list is incomplete.
								</Trans>
							</span>
							<button
								type="button"
								className="underline hover:no-underline"
								onClick={() => void fetchNextPage()}
							>
								<Trans>Retry</Trans>
							</button>
						</div>
					)}

					<PagesGrid
						pages={visible}
						onCreate={handleCreateWithAgent}
						isCreating={creatingWithAgent}
						pinnedPageIds={favoritePageIdSet}
						currentUserId={session?.user.id}
						isPending={pages.isPending}
						error={all.length === 0 ? pages.error?.message : undefined}
						hasFilters={
							!orgEmpty &&
							(Boolean(search.trim()) ||
								activeScope !== "all" ||
								authorId !== null ||
								workspaceId !== null)
						}
						onOpen={(page, event) =>
							openPage(
								page,
								isPaneModifier(event) ? { inPane: true } : undefined,
							)
						}
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
				</div>
			</div>
		</div>
	);
}
