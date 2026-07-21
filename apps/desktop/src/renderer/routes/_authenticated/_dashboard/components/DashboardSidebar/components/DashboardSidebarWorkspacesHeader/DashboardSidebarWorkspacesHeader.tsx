import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { HiChevronRight, HiMiniPlus } from "react-icons/hi2";
import { LuFolderInput, LuFolderPlus, LuLayoutTemplate } from "react-icons/lu";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import {
	useOpenNewProjectModal,
	useOpenTemplateGalleryModal,
} from "renderer/stores/add-repository-modal";
import { useSidebarWorkspacesCollapseStore } from "renderer/stores/sidebar-workspaces-collapse";

export function DashboardSidebarWorkspacesHeader() {
	const isCollapsed = useSidebarWorkspacesCollapseStore((s) => s.isCollapsed);
	const toggleCollapsed = useSidebarWorkspacesCollapseStore((s) => s.toggle);
	const openNewProject = useOpenNewProjectModal();
	const openTemplateGallery = useOpenTemplateGalleryModal();
	const navigate = useNavigate();
	const folderImport = useFolderFirstImport({
		onError: (message) => {
			toast.error(`Import failed: ${message}`);
		},
		onMultipleProjects: ({ candidates }) => {
			toast.error("Import failed", {
				description: `Multiple projects use this repository (${candidates.length}). Choose the project in settings to set it up on this device.`,
				action: {
					label: "Open Projects",
					onClick: () => navigate({ to: "/settings/projects" }),
				},
			});
		},
	});

	const handleImportFolder = async () => {
		const result = await folderImport.start();
		if (result) {
			toast.success("Project ready — open it from the sidebar.");
		}
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: can't be a native <button> — it nests the add-repository dropdown trigger button
		<div
			role="button"
			tabIndex={0}
			onClick={toggleCollapsed}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					toggleCollapsed();
				}
			}}
			className="group flex min-h-8 w-full shrink-0 items-center gap-1.5 py-1.5 pl-5 pr-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/50"
		>
			<span className="min-w-0 truncate text-left">Workspaces</span>
			<HiChevronRight
				className={cn(
					"size-3 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] duration-150 group-hover:opacity-100 group-focus-visible:opacity-100",
					!isCollapsed && "rotate-90",
				)}
			/>
			<div className="min-w-0 flex-1" />
			<DropdownMenu>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label="Add repository"
								onClick={(event) => event.stopPropagation()}
								onKeyDown={(event) => event.stopPropagation()}
								className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
							>
								<LuFolderPlus className="size-4" />
							</button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side="bottom">Add repository</TooltipContent>
				</Tooltip>
				<DropdownMenuContent
					align="end"
					onCloseAutoFocus={(event) => event.preventDefault()}
				>
					<DropdownMenuItem onSelect={() => openNewProject()}>
						<HiMiniPlus className="size-4" />
						Clone from URL
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={handleImportFolder}>
						<LuFolderInput className="size-4" />
						Open from folder
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => openTemplateGallery()}>
						<LuLayoutTemplate className="size-4" />
						Start from a template
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
