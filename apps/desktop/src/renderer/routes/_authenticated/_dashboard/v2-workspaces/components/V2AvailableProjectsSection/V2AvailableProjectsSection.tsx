import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@superset/ui/item";
import { HiChevronDown, HiMiniPlus } from "react-icons/hi2";
import { LuFolderInput } from "react-icons/lu";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import type { AvailableV2Project } from "../../hooks/useAvailableV2Projects";

interface V2AvailableProjectsSectionProps {
	projects: AvailableV2Project[];
	onCreateNewProject: () => void;
	onImportExistingFolder: () => void;
	onPinAndSetup: (project: AvailableV2Project) => void;
}

export function V2AvailableProjectsSection({
	projects,
	onCreateNewProject,
	onImportExistingFolder,
	onPinAndSetup,
}: V2AvailableProjectsSectionProps) {
	return (
		<section className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-baseline gap-2">
					<h2 className="text-sm font-semibold text-foreground">Available</h2>
					<span className="text-xs text-muted-foreground">
						{projects.length}
					</span>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button type="button" size="sm">
							Add repository
							<HiChevronDown className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={onCreateNewProject}>
							<HiMiniPlus className="size-4" />
							New project
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={onImportExistingFolder}>
							<LuFolderInput className="size-4" />
							Import existing folder
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{projects.length > 0 && (
				<ItemGroup className="gap-2">
					{projects.map((project) => (
						<Item key={project.id} variant="outline" size="sm">
							<ProjectThumbnail
								projectName={project.name}
								githubOwner={project.githubOwner}
								className="size-6"
							/>
							<ItemContent>
								<ItemTitle>{project.name}</ItemTitle>
								{project.githubOwner && project.githubRepoName && (
									<span className="text-xs text-muted-foreground">
										{project.githubOwner}/{project.githubRepoName}
									</span>
								)}
							</ItemContent>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => onPinAndSetup(project)}
							>
								Pin & set up
							</Button>
						</Item>
					))}
				</ItemGroup>
			)}
		</section>
	);
}
