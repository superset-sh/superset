import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { normalizePresetProjectIds } from "shared/preset-project-targeting";
import {
	getPresetProjectTargetLabel,
	type PresetProjectOption,
	resolveSelectedPresetProjects,
} from "../../../../preset-project-options";

interface ProjectTargetingFieldProps {
	projectIds: string[] | null | undefined;
	projects: PresetProjectOption[];
	preferredProjectId?: string | null;
	onChange: (projectIds: string[] | null) => void;
}

export function ProjectTargetingField({
	projectIds,
	projects,
	preferredProjectId,
	onChange,
}: ProjectTargetingFieldProps) {
	const [open, setOpen] = useState(false);
	const radioItemClassName =
		"border-border bg-transparent text-foreground shadow-none dark:bg-transparent data-[state=checked]:border-foreground data-[state=checked]:bg-transparent data-[state=checked]:text-foreground dark:data-[state=checked]:bg-transparent focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10 [&_svg]:fill-current";
	const triggerButtonClassName =
		"h-9 w-full justify-between border-border/70 bg-transparent shadow-none hover:bg-accent/40 focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10 dark:bg-transparent";
	const projectOptionsById = useMemo(
		() => new Map(projects.map((project) => [project.id, project])),
		[projects],
	);
	const normalizedProjectIds = normalizePresetProjectIds(projectIds);
	const selectedProjects = useMemo(
		() =>
			resolveSelectedPresetProjects(normalizedProjectIds, projectOptionsById),
		[normalizedProjectIds, projectOptionsById],
	);
	const appliesToValue = normalizedProjectIds === null ? "all" : "projects";
	const buttonLabel = getPresetProjectTargetLabel(
		normalizedProjectIds,
		projectOptionsById,
	);

	const handleAppliesToChange = (value: string) => {
		if (value === "all") {
			onChange(null);
			return;
		}

		if (normalizedProjectIds !== null) {
			onChange(normalizedProjectIds);
			return;
		}

		const fallbackProjectId =
			preferredProjectId && projectOptionsById.has(preferredProjectId)
				? preferredProjectId
				: projects[0]?.id;
		if (!fallbackProjectId) {
			return;
		}

		onChange([fallbackProjectId]);
	};

	const toggleProject = (projectId: string) => {
		const nextIds = new Set(normalizedProjectIds ?? []);
		if (nextIds.has(projectId)) {
			if (nextIds.size === 1) {
				return;
			}
			nextIds.delete(projectId);
		} else {
			nextIds.add(projectId);
		}

		onChange(normalizePresetProjectIds([...nextIds]));
	};

	return (
		<div className="space-y-3">
			<RadioGroup
				value={appliesToValue}
				onValueChange={handleAppliesToChange}
				className="gap-4"
			>
				<div className="flex items-start gap-2">
					<RadioGroupItem
						value="all"
						id="preset-project-scope-all"
						className={radioItemClassName}
					/>
					<div className="space-y-0.5">
						<label
							htmlFor="preset-project-scope-all"
							className="text-sm font-medium"
						>
							All projects
						</label>
						<p className="text-xs text-muted-foreground">
							This preset is available in every project.
						</p>
					</div>
				</div>
				<div className="flex items-start gap-2">
					<RadioGroupItem
						value="projects"
						id="preset-project-scope-specific"
						disabled={projects.length === 0}
						className={radioItemClassName}
					/>
					<div className="min-w-0 flex-1 space-y-2.5">
						<div className="space-y-0.5">
							<label
								htmlFor="preset-project-scope-specific"
								className="text-sm font-medium"
							>
								Specific projects
							</label>
							<p className="text-xs text-muted-foreground">
								Only show this preset in selected projects.
							</p>
						</div>

						{appliesToValue === "projects" ? (
							<>
								<Popover open={open} onOpenChange={setOpen}>
									<PopoverTrigger asChild>
										<Button
											type="button"
											variant="outline"
											className={triggerButtonClassName}
											disabled={projects.length === 0}
										>
											<span className="truncate">{buttonLabel}</span>
											<ChevronsUpDownIcon className="size-4 text-muted-foreground" />
										</Button>
									</PopoverTrigger>
									<PopoverContent align="start" className="w-[320px] p-0">
										<Command>
											<CommandInput placeholder="Search projects..." />
											<CommandList className="max-h-72">
												<CommandEmpty>No projects found.</CommandEmpty>
												<CommandGroup>
													{projects.map((project) => {
														const isSelected =
															normalizedProjectIds?.includes(project.id) ??
															false;
														return (
															<CommandItem
																key={project.id}
																value={`${project.name} ${project.mainRepoPath}`}
																onSelect={() => toggleProject(project.id)}
															>
																<div
																	className="size-2 rounded-full shrink-0"
																	style={{ backgroundColor: project.color }}
																/>
																<div className="min-w-0 flex-1">
																	<div className="truncate">{project.name}</div>
																	<div className="truncate text-xs text-muted-foreground">
																		{project.mainRepoPath}
																	</div>
																</div>
																<CheckIcon
																	className={`size-4 ${
																		isSelected ? "opacity-100" : "opacity-0"
																	}`}
																/>
															</CommandItem>
														);
													})}
												</CommandGroup>
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>

								{selectedProjects.length > 0 ? (
									<p className="text-xs text-muted-foreground">
										{selectedProjects.length} project
										{selectedProjects.length === 1 ? "" : "s"} selected.
									</p>
								) : (
									<p className="text-xs text-muted-foreground">
										Choose one or more projects.
									</p>
								)}
							</>
						) : null}

						{projects.length === 0 ? (
							<p className="text-xs text-muted-foreground">
								Import a project before creating project-specific presets.
							</p>
						) : null}
					</div>
				</div>
			</RadioGroup>
		</div>
	);
}
