import { Trans, useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useRef } from "react";
import { GoGitPullRequest } from "react-icons/go";
import { HiOutlineClipboardDocumentList } from "react-icons/hi2";
import {
	LuClock,
	LuFileText,
	LuLayers,
	LuPlus,
	LuPuzzle,
	LuSearch,
} from "react-icons/lu";
import {
	VscFolderOpened,
	VscGithubAlt,
	VscLayout,
	VscNewFolder,
} from "react-icons/vsc";
import { useFrameStackStore } from "renderer/commandPalette";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { SidebarKbdHint } from "renderer/components/SidebarKbdHint";
import { ZoomStable } from "renderer/components/ZoomStable";
import { env } from "renderer/env.renderer";
import { useZoomFactor } from "renderer/hooks/useZoomFactor";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { NavigationControls } from "renderer/routes/_authenticated/_dashboard/components/NavigationControls";
import { SidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/SidebarToggle";
import { TopBarPortsDropdown } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/TopBarPortsDropdown";
import { useFailedAutomations } from "renderer/routes/_authenticated/_dashboard/hooks/useFailedAutomations";
import {
	pullRequestsSearchFromFilters,
	usePullRequestsFilterStore,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/stores/pullRequestsFilterStore";
import {
	tasksSearchFromFilters,
	useTasksFilterStore,
} from "renderer/routes/_authenticated/_dashboard/tasks/stores/tasks-filter-state";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { STROKE_WIDTH_THICK } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import {
	useOpenEmptyProjectModal,
	useOpenNewProjectModal,
	useOpenTemplateGalleryModal,
} from "renderer/stores/add-repository-modal";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

interface DashboardSidebarHeaderProps {
	isCollapsed?: boolean;
}

export function DashboardSidebarHeader({
	isCollapsed = false,
}: DashboardSidebarHeaderProps) {
	const { t } = useLingui();
	const openModal = useOpenNewWorkspaceModal();
	const openEmptyProject = useOpenEmptyProjectModal();
	const openNewProject = useOpenNewProjectModal();
	const openTemplateGallery = useOpenTemplateGalleryModal();
	const navigate = useNavigate();
	const folderImport = useFolderFirstImport({
		onError: (message) => {
			toast.error(
				t({
					message: `Import failed: ${message}`,
				}),
			);
		},
		onMultipleProjects: ({ candidates }) => {
			toast.error(
				t({
					message: "Import failed",
				}),
				{
					description: t({
						message: `Multiple projects use this repository (${candidates.length}). Choose the project in settings to set it up on this device.`,
					}),
					action: {
						label: t({
							message: "Open Projects",
						}),
						onClick: () => navigate({ to: "/settings/projects" }),
					},
				},
			);
		},
	});

	const handleImportFolder = async () => {
		const result = await folderImport.start();
		if (result) {
			toast.success(
				t({
					message: "Project ready — open it from the sidebar.",
				}),
			);
		}
	};

	const shortcutText = useHotkeyDisplay("NEW_WORKSPACE").text;
	const searchShortcutText = useHotkeyDisplay("OPEN_COMMAND_PALETTE").text;
	const openCommandPalette = useFrameStackStore((s) => s.setOpen);
	// The palette dialog dismisses on outside pointerdown before our click fires,
	// so a live-state toggle would always reopen it. Capture the state at
	// pointerdown to make clicking the button close an open palette.
	const paletteWasOpenRef = useRef(false);
	const handleSearchPointerDown = () => {
		paletteWasOpenRef.current = useFrameStackStore.getState().open;
	};
	const handleSearchClick = () => {
		openCommandPalette(!paletteWasOpenRef.current);
		paletteWasOpenRef.current = false;
	};
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	// Default to Mac while loading so we don't briefly cover the traffic lights.
	const isMac = platform === undefined || platform === "darwin";
	const zoomFactor = useZoomFactor();
	const matchRoute = useMatchRoute();
	const { gateFeature } = usePaywall();
	const isWorkspacesListOpen = !!matchRoute({ to: "/v2-workspaces" });
	const v2WorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const onV2WorkspaceRoute = v2WorkspaceMatch !== false;
	// Pre-select the viewed workspace's project in the new-workspace modal.
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const activeProjectId =
		v2WorkspaceMatch !== false
			? (hostWorkspaces.find(
					(workspace) => workspace.id === v2WorkspaceMatch.workspaceId,
				)?.projectId ?? undefined)
			: undefined;
	const isTasksOpen = !!matchRoute({ to: "/tasks", fuzzy: true });
	const isPullRequestsOpen = !!matchRoute({
		to: "/pull-requests",
		fuzzy: true,
	});
	const isAutomationsOpen = !!matchRoute({ to: "/automations", fuzzy: true });
	const isPluginsOpen = !!matchRoute({ to: "/plugins", fuzzy: true });
	const isPagesOpen = !!matchRoute({ to: "/pages", fuzzy: true });
	// `?? false`: the hook returns undefined until PostHog flags resolve.
	// Dev builds bypass the flag — the local dev account isn't in the
	// @superset.sh release condition.
	const isPluginsEnabled =
		(useFeatureFlagEnabled(FEATURE_FLAGS.PLUGINS) ?? false) ||
		env.NODE_ENV === "development";
	const { myFailedCount } = useFailedAutomations();

	const {
		tab: lastTab,
		assignee: lastAssignee,
		search: lastSearch,
		typeTab: lastTypeTab,
		projectFilters: lastProjectFilters,
		linearProjectFilter: lastLinearProjectFilter,
		includeClosedIssues: lastIncludeClosedIssues,
	} = useTasksFilterStore();
	const {
		search: lastPullRequestsSearch,
		projectFilters: lastPullRequestsProjectFilters,
		authorFilter: lastPullRequestsAuthorFilter,
		reviewFilter: lastPullRequestsReviewFilter,
		includeClosed: lastPullRequestsIncludeClosed,
		mergedOnly: lastPullRequestsMergedOnly,
	} = usePullRequestsFilterStore();

	const handleWorkspacesClick = () => {
		navigate({ to: "/v2-workspaces" });
	};

	const handleAutomationsClick = () => {
		navigate({ to: "/automations" });
	};

	const handleTasksClick = () => {
		gateFeature(GATED_FEATURES.TASKS, () => {
			navigate({
				to: "/tasks",
				search: tasksSearchFromFilters({
					tab: lastTab,
					assignee: lastAssignee,
					search: lastSearch,
					typeTab: lastTypeTab,
					projectFilters: lastProjectFilters,
					linearProjectFilter: lastLinearProjectFilter,
					includeClosedIssues: lastIncludeClosedIssues,
				}),
			});
		});
	};

	const isPagesEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PAGES) ?? false;

	const handlePagesClick = () => {
		navigate({ to: "/pages" });
	};

	const handlePluginsClick = () => {
		navigate({ to: "/plugins" });
	};

	const handlePullRequestsClick = () => {
		navigate({
			to: "/pull-requests",
			search: pullRequestsSearchFromFilters({
				search: lastPullRequestsSearch,
				projectFilters: lastPullRequestsProjectFilters,
				authorFilter: lastPullRequestsAuthorFilter,
				reviewFilter: lastPullRequestsReviewFilter,
				includeClosed: lastPullRequestsIncludeClosed,
				mergedOnly: lastPullRequestsMergedOnly,
			}),
		});
	};

	if (isCollapsed) {
		return (
			<div className="flex flex-col">
				{/* On the v2 workspace route the TopBar is hidden and the pane tab
				    bar is the only top row, so the rail continues that bar across
				    its own width: same height, background, and bottom border as the
				    tab bar, doubling as traffic-light headroom and a drag region. */}
				{onV2WorkspaceRoute && (
					<div
						// w +1px: overlaps the container's border-r so the sidebar's
						// vertical border starts below the bar, not inside it. The fill
						// is the tab bar's bg-muted/45|35-over-background flattened to an
						// opaque color so it can paint over that border pixel.
						className="drag h-10 w-[calc(100%+1px)] shrink-0 bg-[color-mix(in_oklab,var(--muted)_45%,var(--background))] dark:bg-[color-mix(in_oklab,var(--muted)_35%,var(--background))]"
					/>
				)}
				{/* Mirrors the expanded header's nav container so the buttons keep
				    the same padding, order, and vertical rhythm when collapsed. */}
				<div className="flex flex-col items-center gap-1 px-2 pt-3 pb-2">
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => openModal(activeProjectId)}
								className="flex size-7 items-center justify-center rounded-md bg-fill-hover/60 [.light_&]:bg-fill-hover text-muted-foreground transition-colors hover:bg-fill-selected [.light_&]:hover:bg-fill-selected"
							>
								<div className="flex size-5 items-center justify-center rounded bg-fill-selected">
									<LuPlus className="size-3" strokeWidth={STROKE_WIDTH_THICK} />
								</div>
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							<Trans>New Workspace ({shortcutText})</Trans>
						</TooltipContent>
					</Tooltip>

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onPointerDown={handleSearchPointerDown}
								onClick={handleSearchClick}
								className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover"
							>
								<LuSearch className="size-3.5" strokeWidth={1.5} />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							{searchShortcutText !== "Unassigned"
								? t({
										message: `Search (${searchShortcutText})`,
									})
								: t({
										message: "Search",
									})}
						</TooltipContent>
					</Tooltip>

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={handleWorkspacesClick}
								className={cn(
									"flex size-7 items-center justify-center rounded-md transition-colors",
									isWorkspacesListOpen
										? "bg-fill-selected text-muted-foreground"
										: "text-muted-foreground hover:bg-fill-hover",
								)}
							>
								<LuLayers className="size-3.5" strokeWidth={1.5} />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							<Trans>Workspaces</Trans>
						</TooltipContent>
					</Tooltip>

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={handleAutomationsClick}
								aria-label={
									myFailedCount > 0
										? t({
												message: `Automations, ${myFailedCount} failing`,
											})
										: t({
												message: "Automations",
											})
								}
								className={cn(
									"relative flex size-7 items-center justify-center rounded-md transition-colors",
									isAutomationsOpen
										? "bg-fill-selected text-muted-foreground"
										: "text-muted-foreground hover:bg-fill-hover",
								)}
							>
								<LuClock className="size-3.5" strokeWidth={1.5} />
								{myFailedCount > 0 && (
									<span
										aria-hidden="true"
										className="absolute right-1 top-1 size-1.5 rounded-full bg-red-500"
									/>
								)}
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							{myFailedCount > 0 ? (
								<Trans>Automations ({myFailedCount} failing)</Trans>
							) : (
								<Trans>Automations</Trans>
							)}
						</TooltipContent>
					</Tooltip>

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={handleTasksClick}
								aria-label={t({
									message: "Tasks",
								})}
								aria-current={isTasksOpen ? "page" : undefined}
								className={cn(
									"flex size-7 items-center justify-center rounded-md transition-colors",
									isTasksOpen
										? "bg-fill-selected text-muted-foreground"
										: "text-muted-foreground hover:bg-fill-hover",
								)}
							>
								<HiOutlineClipboardDocumentList className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							<Trans>Tasks</Trans>
						</TooltipContent>
					</Tooltip>

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={handlePullRequestsClick}
								aria-label={t({
									message: "Pull requests",
								})}
								aria-current={isPullRequestsOpen ? "page" : undefined}
								className={cn(
									"flex size-7 items-center justify-center rounded-md transition-colors",
									isPullRequestsOpen
										? "bg-fill-selected text-muted-foreground"
										: "text-muted-foreground hover:bg-fill-hover",
								)}
							>
								<GoGitPullRequest className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							<Trans>Pull requests</Trans>
						</TooltipContent>
					</Tooltip>

					{isPagesEnabled && (
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={handlePagesClick}
									aria-label={t({
										message: "Pages",
									})}
									aria-current={isPagesOpen ? "page" : undefined}
									className={cn(
										"flex size-7 items-center justify-center rounded-md transition-colors",
										isPagesOpen
											? "bg-fill-selected text-muted-foreground"
											: "text-muted-foreground hover:bg-fill-hover",
									)}
								>
									<LuFileText className="size-3.5" strokeWidth={1.5} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="right">
								<Trans>Pages</Trans>
							</TooltipContent>
						</Tooltip>
					)}

					{isPluginsEnabled && (
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={handlePluginsClick}
									aria-label={t({
										message: "Plugins",
									})}
									aria-current={isPluginsOpen ? "page" : undefined}
									className={cn(
										"flex size-7 items-center justify-center rounded-md transition-colors",
										isPluginsOpen
											? "bg-fill-selected text-muted-foreground"
											: "text-muted-foreground hover:bg-fill-hover",
									)}
								>
									<LuPuzzle className="size-3.5" strokeWidth={1.5} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="right">
								<Trans>Plugins</Trans>
							</TooltipContent>
						</Tooltip>
					)}

					<DropdownMenu>
						<Tooltip delayDuration={700}>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										aria-label={t({
											message: "Add project",
										})}
										className="group/addrepo flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover"
									>
										<VscNewFolder className="size-3.5 group-hover/addrepo:hidden" />
										<VscFolderOpened className="hidden size-3.5 group-hover/addrepo:block" />
									</button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent side="right">
								<Trans>Add project</Trans>
							</TooltipContent>
						</Tooltip>
						<DropdownMenuContent
							align="start"
							onCloseAutoFocus={(event) => event.preventDefault()}
						>
							<DropdownMenuItem onSelect={handleImportFolder}>
								<VscFolderOpened className="size-4" />
								<Trans>Open project</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => openNewProject()}>
								<VscGithubAlt className="size-4" />
								<Trans>Clone from URL</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => openEmptyProject()}>
								<VscNewFolder className="size-4" />
								<Trans>Create new project</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => openTemplateGallery()}>
								<VscLayout className="size-4" />
								<Trans>Start from a template</Trans>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		);
	}

	return (
		<div
			className="flex flex-col gap-px px-2 pt-2 pb-2"
			// Pin the top inset so the traffic-light row stays a constant physical
			// distance from the window top under page zoom (see the row below).
			style={isMac ? { paddingTop: `${8 / zoomFactor}px` } : undefined}
		>
			{/* -mx-2 cancels the parent's px-2 so this row owns the 80px traffic-light
			    inset; inset and height are counter-scaled to a constant physical size
			    so the fixed macOS traffic lights stay aligned under page zoom. On Mac
			    the control clusters below use ZoomStable so the collapse/nav icons and
			    usage badge keep a constant physical size instead of scaling with page
			    zoom and overflowing this fixed-height row. It's Mac-only because the
			    pinned row height it matches is Mac-only; elsewhere the row height (h-8)
			    scales with zoom, so the controls should scale with it. */}
			<div
				// Window-drag regions live on the empty spacer + filler leaves, never
				// on this row: `no-drag` carve-outs under a `drag` ancestor are lost
				// inside zoomed wrappers like ZoomStable, deadening the controls.
				className="-mx-2 mb-3 flex h-8 items-center pr-3"
				style={isMac ? { height: `${32 / zoomFactor}px` } : undefined}
			>
				<div
					className="drag h-full shrink-0"
					style={{ width: isMac ? `${80 / zoomFactor}px` : "8px" }}
				/>
				<ZoomStable enabled={isMac} className="flex items-center gap-1">
					<SidebarToggle />
					<NavigationControls />
					{/* Lives here (persistent chrome) rather than the workspace tab
					    bar, which remounts on every navigation. */}
					<TopBarPortsDropdown align="start" />
				</ZoomStable>
				<div className="drag h-full min-w-0 flex-1" />
			</div>

			<button
				type="button"
				onClick={() => openModal(activeProjectId)}
				className="group flex h-7 w-full items-center gap-2 rounded-md bg-fill-hover/60 [.light_&]:bg-fill-hover px-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-fill-selected [.light_&]:hover:bg-fill-selected hover:text-foreground"
			>
				<div className="flex size-5 shrink-0 items-center justify-center rounded bg-fill-selected">
					<LuPlus className="size-3" strokeWidth={STROKE_WIDTH_THICK} />
				</div>
				<span className="flex-1 truncate text-left whitespace-nowrap">
					<Trans>New Workspace</Trans>
				</span>
				<SidebarKbdHint label={shortcutText} />
			</button>

			<button
				type="button"
				onPointerDown={handleSearchPointerDown}
				onClick={handleSearchClick}
				className="group flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
			>
				<LuSearch
					className="size-4 shrink-0 text-muted-foreground"
					strokeWidth={1.5}
				/>
				<span className="flex-1 text-left">
					<Trans>Search</Trans>
				</span>
				{searchShortcutText !== "Unassigned" && (
					<SidebarKbdHint label={searchShortcutText} />
				)}
			</button>

			<button
				type="button"
				onClick={handleWorkspacesClick}
				className={cn(
					"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
					isWorkspacesListOpen
						? "bg-fill-selected text-foreground"
						: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
				)}
			>
				<LuLayers
					className="size-4 shrink-0 text-muted-foreground"
					strokeWidth={1.5}
				/>
				<span className="flex-1 text-left">
					<Trans>Workspaces</Trans>
				</span>
			</button>

			<button
				type="button"
				onClick={handleAutomationsClick}
				className={cn(
					"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
					isAutomationsOpen
						? "bg-fill-selected text-foreground"
						: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
				)}
			>
				<LuClock
					className="size-4 shrink-0 text-muted-foreground"
					strokeWidth={1.5}
				/>
				<span className="flex-1 text-left">
					<Trans>Automations</Trans>
				</span>
				{myFailedCount > 0 && (
					<span
						title={t({
							message: `${myFailedCount} of your automations failed their last run`,
						})}
						className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500/15 px-1 text-[10px] font-medium tabular-nums text-red-600 dark:text-red-400"
					>
						{myFailedCount > 9 ? "9+" : myFailedCount}
					</span>
				)}
			</button>

			<button
				type="button"
				onClick={handleTasksClick}
				aria-label={t({
					message: "Tasks",
				})}
				aria-current={isTasksOpen ? "page" : undefined}
				className={cn(
					"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
					isTasksOpen
						? "bg-fill-selected text-foreground"
						: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
				)}
			>
				<HiOutlineClipboardDocumentList className="size-4 shrink-0 text-muted-foreground" />
				<span className="flex-1 text-left">
					<Trans>Tasks</Trans>
				</span>
			</button>

			<button
				type="button"
				onClick={handlePullRequestsClick}
				aria-label={t({
					message: "Pull requests",
				})}
				aria-current={isPullRequestsOpen ? "page" : undefined}
				className={cn(
					"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
					isPullRequestsOpen
						? "bg-fill-selected text-foreground"
						: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
				)}
			>
				<GoGitPullRequest className="size-4 shrink-0 text-muted-foreground" />
				<span className="flex-1 text-left">
					<Trans>Pull requests</Trans>
				</span>
			</button>

			{isPagesEnabled && (
				<button
					type="button"
					onClick={handlePagesClick}
					aria-label={t({
						message: "Pages",
					})}
					aria-current={isPagesOpen ? "page" : undefined}
					className={cn(
						"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
						isPagesOpen
							? "bg-fill-selected text-foreground"
							: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
					)}
				>
					<LuFileText
						className="size-4 shrink-0 text-muted-foreground"
						strokeWidth={1.5}
					/>
					<span className="flex-1 text-left">
						<Trans>Pages</Trans>
					</span>
				</button>
			)}

			{isPluginsEnabled && (
				<button
					type="button"
					onClick={handlePluginsClick}
					aria-label={t({
						message: "Plugins",
					})}
					aria-current={isPluginsOpen ? "page" : undefined}
					className={cn(
						"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
						isPluginsOpen
							? "bg-fill-selected text-foreground"
							: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
					)}
				>
					<LuPuzzle
						className="size-4 shrink-0 text-muted-foreground"
						strokeWidth={1.5}
					/>
					<span className="flex-1 text-left">
						<Trans>Plugins</Trans>
					</span>
				</button>
			)}
		</div>
	);
}
