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
import {
	VscFolderOpened,
	VscGithubAlt,
	VscLayout,
	VscNewFolder,
} from "react-icons/vsc";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import {
	useOpenEmptyProjectModal,
	useOpenNewProjectModal,
	useOpenTemplateGalleryModal,
} from "renderer/stores/add-repository-modal";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";

export function DashboardSidebarWorkspacesHeader() {
	const { t } = useLingui();
	const openEmptyProject = useOpenEmptyProjectModal();
	const openNewProject = useOpenNewProjectModal();
	const openTemplateGallery = useOpenTemplateGalleryModal();
	const navigate = useNavigate();
	const folderImport = useFolderFirstImport({
		onError: (message) => {
			toast.error(
				t({
					id: "dashboard.sidebar.workspacesHeader.importFailed",
					message: `Import failed: ${message}`,
				}),
			);
		},
		onMultipleProjects: ({ candidates }) => {
			toast.error(
				t({
					id: "dashboard.sidebar.workspacesHeader.importFailedTitle",
					message: "Import failed",
				}),
				{
					description: t({
						id: "dashboard.sidebar.workspacesHeader.importMultipleProjects",
						message: `Multiple projects use this repository (${candidates.length}). Choose the project in settings to set it up on this device.`,
					}),
					action: {
						label: t({
							id: "dashboard.sidebar.workspacesHeader.openProjectsAction",
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
					id: "dashboard.sidebar.workspacesHeader.projectReady",
					message: "Project ready — open it from the sidebar.",
				}),
			);
		}
	};

	return (
		<DashboardSidebarSectionHeader
			label={t({
				id: "dashboard.sidebar.sectionProjects",
				message: "Projects",
			})}
			section="workspaces"
		>
			<DropdownMenu>
				<Tooltip delayDuration={700}>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label={t({
									id: "dashboard.sidebar.workspacesHeader.addProjectAriaLabel",
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
						<Trans id="dashboard.sidebar.workspacesHeader.addProject">
							Add project
						</Trans>
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
						<Trans id="dashboard.sidebar.workspacesHeader.openProject">
							Open project
						</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => openNewProject()}>
						<VscGithubAlt className="size-4" />
						<Trans id="dashboard.sidebar.workspacesHeader.cloneFromUrl">
							Clone from URL
						</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => openEmptyProject()}>
						<VscNewFolder className="size-4" />
						<Trans id="dashboard.sidebar.workspacesHeader.createNewProject">
							Create new project
						</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => openTemplateGallery()}>
						<VscLayout className="size-4" />
						<Trans id="dashboard.sidebar.workspacesHeader.startFromTemplate">
							Start from a template
						</Trans>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</DashboardSidebarSectionHeader>
	);
}
