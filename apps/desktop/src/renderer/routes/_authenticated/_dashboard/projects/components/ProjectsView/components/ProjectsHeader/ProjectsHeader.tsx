import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { TaskProjectState } from "@superset/db/schema";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	LuArrowDownUp,
	LuCircleDashed,
	LuListFilter,
	LuPlus,
	LuUser,
} from "react-icons/lu";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import {
	PROJECT_STATES,
	ProjectStateIcon,
} from "renderer/routes/_authenticated/_dashboard/components/ProjectStateIcon";
import { SubmenuValue } from "renderer/routes/_authenticated/_dashboard/components/SubmenuValue";
import { ToolbarMenuButton } from "renderer/routes/_authenticated/_dashboard/components/ToolbarMenuButton";
import { WorkItemsSearch } from "renderer/routes/_authenticated/_dashboard/components/WorkItemsSearch";
import { useProjectStateLabels } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectStateLabels";
import type { ProjectSort } from "renderer/routes/_authenticated/_dashboard/stores/listDisplayStore";
import type { TaskProjectRow } from "../../types";

interface Person {
	id: string;
	name: string;
	image: string | null;
}

interface ProjectsHeaderProps {
	query: string;
	projects: TaskProjectRow[];
	people: Person[];
	status: TaskProjectState[];
	leads: string[];
	onQueryChange: (query: string) => void;
	onStatusChange: (status: TaskProjectState[]) => void;
	onLeadsChange: (leads: string[]) => void;
	sort: ProjectSort;
	onSortChange: (sort: ProjectSort) => void;
	onClearFilters: () => void;
	onNewProject: () => void;
}

const toggle = <Value extends string>(list: Value[], value: Value) =>
	list.includes(value)
		? list.filter((item) => item !== value)
		: [...list, value];

export function ProjectsHeader({
	query,
	projects,
	people,
	status,
	leads,
	onQueryChange,
	onStatusChange,
	onLeadsChange,
	sort,
	onSortChange,
	onClearFilters,
	onNewProject,
}: ProjectsHeaderProps) {
	const { t } = useLingui();
	const stateLabels = useProjectStateLabels();
	const sortLabels: Record<ProjectSort, string> = {
		status: t({ message: "Status" }),
		name: t({ message: "Name" }),
		target: t({ message: "Target date" }),
		created: t({ message: "Created" }),
	};
	const activeFilterCount =
		(status.length > 0 ? 1 : 0) + (leads.length > 0 ? 1 : 0);
	const leadCounts = new Map<string, number>();
	for (const project of projects) {
		if (project.lead) {
			leadCounts.set(
				project.lead.userId,
				(leadCounts.get(project.lead.userId) ?? 0) + 1,
			);
		}
	}
	const leadOptions = people.filter((person) => leadCounts.has(person.id));
	const chosenLeads = leadOptions.filter((person) => leads.includes(person.id));

	return (
		<PageHeader
			end={
				<>
					<DropdownMenu modal={false}>
						<DropdownMenuTrigger asChild>
							<ToolbarMenuButton isActive={activeFilterCount > 0}>
								<LuListFilter className="size-3.5" />
								<Trans>Filter</Trans>
								{activeFilterCount > 0 && (
									<span className="flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-accent-foreground">
										{activeFilterCount}
									</span>
								)}
							</ToolbarMenuButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="min-w-[14rem]">
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<span className="flex items-center gap-2">
										<LuCircleDashed className="size-3.5" />
										<Trans>Status</Trans>
									</span>
									{status.length > 0 && (
										<SubmenuValue>
											{status.map((state) => stateLabels[state]).join(", ")}
										</SubmenuValue>
									)}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="min-w-0">
									{PROJECT_STATES.map((state) => (
										<DropdownMenuCheckboxItem
											indicator="end"
											key={state}
											checked={status.includes(state)}
											onSelect={(event) => event.preventDefault()}
											onCheckedChange={() =>
												onStatusChange(toggle(status, state))
											}
										>
											<span className="flex min-w-0 flex-1 items-center gap-2">
												<ProjectStateIcon state={state} />
												{stateLabels[state]}
											</span>
											<span className="ml-3 text-xs tabular-nums text-muted-foreground">
												{
													projects.filter((project) => project.state === state)
														.length
												}
											</span>
										</DropdownMenuCheckboxItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<span className="flex items-center gap-2">
										<LuUser className="size-3.5" />
										<Trans>Lead</Trans>
									</span>
									{chosenLeads.length > 0 && (
										<SubmenuValue>
											{chosenLeads.length === 1
												? chosenLeads[0]?.name
												: t({
														message: plural(chosenLeads.length, {
															one: "# person",
															other: "# people",
														}),
													})}
										</SubmenuValue>
									)}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="max-h-[60vh] min-w-0 overflow-y-auto">
									{leadOptions.map((person) => (
										<DropdownMenuCheckboxItem
											indicator="end"
											key={person.id}
											checked={leads.includes(person.id)}
											onSelect={(event) => event.preventDefault()}
											onCheckedChange={() =>
												onLeadsChange(toggle(leads, person.id))
											}
										>
											<span className="flex min-w-0 flex-1 items-center gap-2">
												<AvatarStack
													people={[person]}
													size={16}
													surface="popover"
												/>
												<span className="min-w-0 truncate">{person.name}</span>
											</span>
											<span className="ml-3 text-xs tabular-nums text-muted-foreground">
												{leadCounts.get(person.id) ?? 0}
											</span>
										</DropdownMenuCheckboxItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
							{activeFilterCount > 0 && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										className="justify-center text-xs text-muted-foreground"
										onSelect={onClearFilters}
									>
										<Trans>Clear filters</Trans>
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
					<DropdownMenu modal={false}>
						<DropdownMenuTrigger asChild>
							<ToolbarMenuButton>
								<LuArrowDownUp className="size-3.5" />
								<Trans>Display</Trans>
							</ToolbarMenuButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="min-w-[12rem]">
							<DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
								<Trans>Sort by</Trans>
							</DropdownMenuLabel>
							<DropdownMenuRadioGroup
								value={sort}
								onValueChange={(value) => onSortChange(value as ProjectSort)}
							>
								{(["status", "name", "target", "created"] as const).map(
									(option) => (
										<DropdownMenuRadioItem key={option} value={option}>
											{sortLabels[option]}
										</DropdownMenuRadioItem>
									),
								)}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
					<WorkItemsSearch
						value={query}
						onChange={onQueryChange}
						placeholder={t({ message: "Search projects…" })}
						label={t({ message: "Search projects" })}
						containerClassName="@4xl:w-60 w-60"
					/>
					<Button variant="outline" size="sm" onClick={onNewProject}>
						<LuPlus />
						<Trans>New project</Trans>
					</Button>
				</>
			}
		/>
	);
}
