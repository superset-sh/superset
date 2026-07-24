import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { HiChevronRight, HiMiniPlus } from "react-icons/hi2";
import {
	LuFolderInput,
	LuFolderPlus,
	LuLayers,
	LuLayoutTemplate,
} from "react-icons/lu";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import {
	useOpenNewProjectModal,
	useOpenTemplateGalleryModal,
} from "renderer/stores/add-repository-modal";
import { usePrototypeStore } from "../../store/usePrototypeStore";

/**
 * "Projects" panel header: click collapses/expands the panel (view controls +
 * grouped workspace list). The Add-repository dropdown is the real one —
 * handlers copied from DashboardSidebarHeader, so Clone from URL / Open from
 * folder / Start from a template all genuinely work.
 */
export function PrototypeProjectsHeader() {
	const projectsCollapsed = usePrototypeStore((s) => s.projectsCollapsed);
	const toggleProjectsCollapsed = usePrototypeStore(
		(s) => s.toggleProjectsCollapsed,
	);
	const viewControlsCollapsed = usePrototypeStore(
		(s) => s.viewControlsCollapsed,
	);
	const toggleViewControls = usePrototypeStore((s) => s.toggleViewControls);

	const navigate = useNavigate();
	const openNewProject = useOpenNewProjectModal();
	const openTemplateGallery = useOpenTemplateGalleryModal();
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
		// biome-ignore lint/a11y/useSemanticElements: contains a nested dropdown trigger button, so the row can't be a <button>
		<div
			role="button"
			tabIndex={0}
			onClick={toggleProjectsCollapsed}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					toggleProjectsCollapsed();
				}
			}}
			className="group flex w-full cursor-pointer items-center gap-2 py-1.5 pr-2 pl-3 font-medium text-muted-foreground text-sm transition-colors hover:bg-muted/50"
		>
			<div className="flex size-5 shrink-0 items-center justify-center">
				<HiChevronRight
					className={cn(
						"size-4 text-muted-foreground transition-transform",
						!projectsCollapsed && "rotate-90",
					)}
				/>
			</div>
			<span className="flex-1 truncate text-left">Projects</span>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label="Groups & ordering"
						aria-pressed={!viewControlsCollapsed}
						onClick={(event) => {
							event.stopPropagation();
							toggleViewControls();
						}}
						className={cn(
							"flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent/50 hover:text-foreground",
							viewControlsCollapsed
								? "text-muted-foreground"
								: "text-foreground",
						)}
					>
						<LuLayers className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<p className="flex items-center gap-2 text-xs">
						Groups & ordering
						<KbdGroup>
							<Kbd>⇧</Kbd>
							<Kbd>⌥</Kbd>
							<Kbd>G</Kbd>
						</KbdGroup>
					</p>
				</TooltipContent>
			</Tooltip>
			<DropdownMenu>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label="Add repository"
								onClick={(event) => event.stopPropagation()}
								className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
							>
								<LuFolderPlus className="size-4" />
							</button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side="right">Add repository</TooltipContent>
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
