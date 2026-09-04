import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import {
	VscFolderOpened,
	VscGithubAlt,
	VscLayout,
	VscNewFolder,
} from "react-icons/vsc";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import type { SidebarProjectSortMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import {
	useOpenEmptyProjectModal,
	useOpenNewProjectModal,
	useOpenTemplateGalleryModal,
} from "renderer/stores/add-repository-modal";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";
import { DashboardSidebarProjectsFilterInput } from "./components/DashboardSidebarProjectsFilterInput";
import { DashboardSidebarProjectsSortMenu } from "./components/DashboardSidebarProjectsSortMenu";
import { useProjectFilterExpanded } from "./hooks/useProjectFilterExpanded";

interface DashboardSidebarWorkspacesHeaderProps {
	sortMode: SidebarProjectSortMode;
	onSortModeChange: (mode: SidebarProjectSortMode) => void;
	filterQuery: string;
	onFilterQueryChange: (query: string) => void;
}

export function DashboardSidebarWorkspacesHeader({
	sortMode,
	onSortModeChange,
	filterQuery,
	onFilterQueryChange,
}: DashboardSidebarWorkspacesHeaderProps) {
	const { t } = useLingui();
	const isSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed.workspaces,
	);
	const toggleSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.toggle,
	);
	// The query lives in DashboardSidebar (it clears it when the sidebar
	// collapses to the icon rail); only the open/closed flag is local, and
	// the hook keeps the input open whenever a query is active because this
	// header unmounts under the bulk-selection toolbar.
	const [isFilterExpanded, setIsFilterExpanded] =
		useProjectFilterExpanded(filterQuery);
	const handleFilterExpandedChange = (expanded: boolean) => {
		setIsFilterExpanded(expanded);
		// Filtering a hidden list is useless — reveal it when the search opens.
		if (expanded && isSectionCollapsed) toggleSectionCollapsed("workspaces");
	};
	// The converse: collapsing the section while the input is open would leave
	// a filter running against a hidden list (and no chevron to say the rows
	// are merely collapsed), so a collapse closes the filter.
	const wasSectionCollapsedRef = useRef(isSectionCollapsed);
	useEffect(() => {
		if (isSectionCollapsed && !wasSectionCollapsedRef.current) {
			onFilterQueryChange("");
			setIsFilterExpanded(false);
		}
		wasSectionCollapsedRef.current = isSectionCollapsed;
	}, [isSectionCollapsed, onFilterQueryChange, setIsFilterExpanded]);
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

	return (
		<DashboardSidebarSectionHeader
			label={t({
				message: "Projects",
			})}
			section="workspaces"
			labelHidden={isFilterExpanded}
		>
			<DashboardSidebarProjectsFilterInput
				query={filterQuery}
				onQueryChange={onFilterQueryChange}
				isExpanded={isFilterExpanded}
				onExpandedChange={handleFilterExpandedChange}
			/>
			<DashboardSidebarProjectsSortMenu
				sortMode={sortMode}
				onSortModeChange={onSortModeChange}
			/>
			<DropdownMenu>
				<Tooltip delayDuration={700}>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label={t({
									message: "Add project",
								})}
								onClick={(event) => event.stopPropagation()}
								onKeyDown={(event) => event.stopPropagation()}
								className="group/addrepo flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
							>
								<VscNewFolder className="size-3.5 group-hover/addrepo:hidden" />
								<VscFolderOpened className="hidden size-3.5 group-hover/addrepo:block" />
							</button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Add project</Trans>
					</TooltipContent>
				</Tooltip>
				<DropdownMenuContent
					align="end"
					onCloseAutoFocus={(event) => event.preventDefault()}
					// The content portals to body but React events still bubble up the
					// component tree — without these, selecting an item triggers the
					// header row's collapse toggle.
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
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
		</DashboardSidebarSectionHeader>
	);
}
