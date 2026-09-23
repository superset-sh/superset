import { Trans, useLingui } from "@lingui/react/macro";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileText, LayoutGrid, Plus } from "lucide-react";
import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	isPaneModifier,
	useOpenPage,
} from "renderer/routes/_authenticated/_dashboard/hooks/useOpenPage";
import { usePageFavorites } from "renderer/routes/_authenticated/_dashboard/hooks/usePageFavorites";
import { usePagesList } from "renderer/routes/_authenticated/_dashboard/hooks/usePagesList";
import { pagesListInput } from "renderer/routes/_authenticated/_dashboard/utils/pagesListInput";
import type { CreateNewAgentSession } from "../../hooks/useAgentSessionLauncher";
import { NewPageComposer } from "./components/NewPageComposer";
import { PagesMenuRow } from "./components/PagesMenuRow";
import {
	usePagesMenuSeenAt,
	usePagesMenuSeenStore,
} from "./stores/pagesMenuSeenStore";
import { type MenuPage, selectMenuPages } from "./utils/selectMenuPages";

const MENU_PAGE_LIMIT = 200;

interface WorkspacePagesMenuProps {
	workspaceId: string;
	onCreateNewAgentSession: CreateNewAgentSession;
	onFocusAgentTerminal: (terminalId: string) => void;
}

export function WorkspacePagesMenu({
	workspaceId,
	onCreateNewAgentSession,
	onFocusAgentTerminal,
}: WorkspacePagesMenuProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const openPage = useOpenPage();
	const utils = cloudTrpc.useUtils();
	const { favoritePageIds } = usePageFavorites();
	const seenAt = usePagesMenuSeenAt(workspaceId);
	const markSeen = usePagesMenuSeenStore((state) => state.markSeen);

	const [open, setOpen] = useState(false);
	const [composing, setComposing] = useState(false);

	// This menu orders by publish time, not creation time, so it takes one
	// large batch rather than the grid's scroll-sized one. Built once because
	// `invalidate` matches a cached query by its input — a different `limit`
	// here than below and neither a publish nor opening the menu would refresh.
	const workspaceFilter = useMemo(
		() => ({ workspaceId, limit: MENU_PAGE_LIMIT }),
		[workspaceId],
	);
	const workspaceListInput = useMemo(
		() => pagesListInput(workspaceFilter),
		[workspaceFilter],
	);
	const workspacePagesQuery = usePagesList(workspaceFilter, {
		staleTime: 60_000,
	});
	// Only the pins, by id — this menu never needed the rest of the org.
	const pinnedPagesQuery = usePagesList(
		{ ids: favoritePageIds, limit: MENU_PAGE_LIMIT },
		{ enabled: open && favoritePageIds.length > 0, staleTime: 60_000 },
	);

	// A publish from this workspace registers its agent as the page's watcher.
	useWorkspaceEvent(
		"page-watch:changed",
		workspaceId,
		useCallback(() => {
			void utils.page.listBatch.invalidate(workspaceListInput);
		}, [utils, workspaceListInput]),
	);

	const { workspace, pinned, hasNew } = useMemo(
		() =>
			selectMenuPages({
				workspacePages: workspacePagesQuery.items,
				orgPages: pinnedPagesQuery.items,
				favoritePageIds,
				seenAt,
			}),
		[
			workspacePagesQuery.items,
			pinnedPagesQuery.items,
			favoritePageIds,
			seenAt,
		],
	);

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) {
			void utils.page.listBatch.invalidate(workspaceListInput);
			return;
		}
		setComposing(false);
		markSeen(workspaceId, workspace[0]?.publishedAtMs ?? 0);
	};

	const handleOpenPage = (page: MenuPage, event: MouseEvent) => {
		handleOpenChange(false);
		openPage(
			{ id: page.id, slug: page.slug, title: page.title },
			isPaneModifier(event) ? { inPane: true } : undefined,
		);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<Tooltip disableHoverableContent>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "Pages" })}
							className={cn(
								"no-drag flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-border/50 bg-transparent px-2 text-xs font-medium text-muted-foreground/80 transition-colors",
								"hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
								open && "bg-muted/60 text-foreground",
								hasNew &&
									"border-blue-500/40 bg-blue-500/[0.08] text-blue-500 hover:bg-blue-500/[0.12] hover:text-blue-500",
							)}
						>
							<FileText className="size-3 shrink-0" />
							{workspace.length > 0 && (
								<span className="tabular-nums">{workspace.length}</span>
							)}
							{hasNew && (
								<span className="text-[10px] font-semibold">
									<Trans context="badge on a page published since the menu was last opened">
										New
									</Trans>
								</span>
							)}
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Trans>Pages</Trans>
				</TooltipContent>
			</Tooltip>
			<PopoverContent
				align="end"
				sideOffset={6}
				className="w-72 p-1"
				onEscapeKeyDown={(event) => {
					if (!composing) return;
					event.preventDefault();
					setComposing(false);
				}}
			>
				{composing ? (
					<>
						<button
							type="button"
							onClick={() => setComposing(false)}
							className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
						>
							<ArrowLeft className="size-3.5 shrink-0" />
							<Trans>New page</Trans>
						</button>
						<NewPageComposer
							workspaceId={workspaceId}
							onSent={() => handleOpenChange(false)}
							onCreateNewAgentSession={onCreateNewAgentSession}
							onFocusAgentTerminal={onFocusAgentTerminal}
						/>
					</>
				) : (
					<>
						<button
							type="button"
							onClick={() => setComposing(true)}
							className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
						>
							<Plus className="size-3.5 shrink-0 text-muted-foreground" />
							<Trans>New page</Trans>
						</button>
						{workspace.length > 0 && (
							<>
								<div className="-mx-1 my-1 h-px bg-border" />
								<div className="px-2 pb-0.5 pt-1 text-[11px] font-medium text-muted-foreground">
									<Trans>This workspace</Trans>
								</div>
								<div className="max-h-64 overflow-y-auto">
									{workspace.map((page) => (
										<PagesMenuRow
											key={page.id}
											page={page}
											onOpen={handleOpenPage}
										/>
									))}
								</div>
							</>
						)}
						{pinned.length > 0 && (
							<>
								<div className="-mx-1 my-1 h-px bg-border" />
								<div className="px-2 pb-0.5 pt-1 text-[11px] font-medium text-muted-foreground">
									<Trans>Pinned</Trans>
								</div>
								<div className="max-h-40 overflow-y-auto">
									{pinned.map((page) => (
										<PagesMenuRow
											key={page.id}
											page={page}
											onOpen={handleOpenPage}
										/>
									))}
								</div>
							</>
						)}
						<div className="-mx-1 my-1 h-px bg-border" />
						<button
							type="button"
							onClick={() => {
								handleOpenChange(false);
								void navigate({ to: "/pages" });
							}}
							className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
						>
							<LayoutGrid className="size-3.5 shrink-0" />
							<Trans>All pages</Trans>
						</button>
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}
