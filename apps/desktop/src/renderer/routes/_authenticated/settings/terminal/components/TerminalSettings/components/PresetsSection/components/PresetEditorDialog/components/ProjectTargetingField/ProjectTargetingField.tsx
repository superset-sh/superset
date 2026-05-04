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
import { cn } from "@superset/ui/utils";
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

type Scope = "all" | "specific";

export function ProjectTargetingField({
	projectIds,
	projects,
	preferredProjectId,
	onChange,
}: ProjectTargetingFieldProps) {
	const [open, setOpen] = useState(false);
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
	const scope: Scope = normalizedProjectIds === null ? "all" : "specific";
	const buttonLabel = getPresetProjectTargetLabel(
		normalizedProjectIds,
		projectOptionsById,
	);

	const handleScopeChange = (next: Scope) => {
		if (next === "all") {
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
		if (!fallbackProjectId) return;
		onChange([fallbackProjectId]);
	};

	const toggleProject = (projectId: string) => {
		const nextIds = new Set(normalizedProjectIds ?? []);
		if (nextIds.has(projectId)) {
			if (nextIds.size === 1) return;
			nextIds.delete(projectId);
		} else {
			nextIds.add(projectId);
		}
		onChange(normalizePresetProjectIds([...nextIds]));
	};

	const segmentedOptions: { value: Scope; label: string }[] = [
		{ value: "all", label: "All projects" },
		{ value: "specific", label: "Specific" },
	];

	return (
		<div className="space-y-2">
			<div className="inline-flex w-full overflow-hidden rounded-md border border-border">
				{segmentedOptions.map((option, idx) => (
					<button
						key={option.value}
						type="button"
						onClick={() => handleScopeChange(option.value)}
						disabled={option.value === "specific" && projects.length === 0}
						className={cn(
							"flex-1 px-3 py-1 text-xs font-medium transition-colors",
							idx > 0 && "border-l border-border",
							scope === option.value
								? "bg-accent text-accent-foreground"
								: "bg-transparent text-muted-foreground hover:bg-accent/50",
							"disabled:cursor-not-allowed disabled:opacity-50",
						)}
					>
						{option.label}
					</button>
				))}
			</div>

			{scope === "specific" && projects.length > 0 ? (
				<>
					<Popover open={open} onOpenChange={setOpen}>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-8 w-full justify-between"
							>
								<span className="truncate">{buttonLabel}</span>
								<ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
							</Button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-[280px] p-0">
							<Command>
								<CommandInput placeholder="Search projects..." />
								<CommandList className="max-h-72">
									<CommandEmpty>No projects found.</CommandEmpty>
									<CommandGroup>
										{projects.map((project) => {
											const isSelected =
												normalizedProjectIds?.includes(project.id) ?? false;
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
														className={cn(
															"size-4",
															isSelected ? "opacity-100" : "opacity-0",
														)}
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
					) : null}
				</>
			) : null}

			{projects.length === 0 ? (
				<p className="text-xs text-muted-foreground">
					Import a project to scope presets.
				</p>
			) : null}
		</div>
	);
}
