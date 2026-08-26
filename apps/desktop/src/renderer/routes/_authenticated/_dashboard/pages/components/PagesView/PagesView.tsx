import { Input } from "@superset/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useMemo } from "react";
import { LuSearch } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	isPaneModifier,
	useOpenPage,
} from "renderer/routes/_authenticated/_dashboard/hooks/useOpenPage";
import {
	filterPages,
	matchesScope,
	type PageScope,
	sortPinnedFirst,
} from "../../utils/filterPages";
import { PagesGrid } from "../PagesGrid";
import { usePageFavorites } from "./hooks/usePageFavorites";

const TABS: Array<{ value: PageScope; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "pinned", label: "Pinned" },
	{ value: "team", label: "Team" },
	{ value: "mine", label: "Just me" },
];

interface PagesViewProps {
	search: string;
	scope: PageScope;
	onSearchChange: (search: string) => void;
	onScopeChange: (scope: PageScope) => void;
}

export function PagesView({
	search,
	scope,
	onSearchChange,
	onScopeChange,
}: PagesViewProps) {
	const pages = cloudTrpc.page.list.useQuery({});
	const { favoritePageIdSet, toggleFavorite } = usePageFavorites();
	const openPage = useOpenPage();

	const all = useMemo(() => pages.data ?? [], [pages.data]);

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

	const visible = useMemo(
		() =>
			sortPinnedFirst(
				filterPages(all, { search, scope, pinnedPageIds: favoritePageIdSet }),
				favoritePageIdSet,
			),
		[all, search, scope, favoritePageIdSet],
	);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<div className="drag h-10 shrink-0" />

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-8 pb-12">
					<div className="flex items-center justify-between">
						<h1 className="font-semibold text-xl tracking-tight">Pages</h1>
					</div>

					<div className="mt-6 flex items-center justify-between gap-2">
						<Tabs
							value={scope}
							onValueChange={(value) => onScopeChange(value as PageScope)}
						>
							<TabsList className="h-8 gap-1 bg-transparent p-0">
								{TABS.map((tab) => (
									<TabsTrigger
										key={tab.value}
										value={tab.value}
										className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
									>
										<span className="text-sm">{tab.label}</span>
										<span className="ml-1 text-muted-foreground text-xs tabular-nums">
											{counts[tab.value]}
										</span>
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>

						<div className="relative w-56">
							<LuSearch className="-translate-y-1/2 absolute top-1/2 left-2 size-3.5 text-muted-foreground" />
							<Input
								value={search}
								onChange={(event) => onSearchChange(event.target.value)}
								placeholder="Search pages"
								className="h-8 pl-7 text-sm"
							/>
						</div>
					</div>

					<PagesGrid
						pages={visible}
						pinnedPageIds={favoritePageIdSet}
						isPending={pages.isPending}
						error={pages.error?.message}
						hasFilters={Boolean(search.trim()) || scope !== "all"}
						onOpen={(page, event) =>
							openPage(page, { inPane: isPaneModifier(event) })
						}
						onTogglePin={toggleFavorite}
					/>
				</div>
			</div>
		</div>
	);
}
