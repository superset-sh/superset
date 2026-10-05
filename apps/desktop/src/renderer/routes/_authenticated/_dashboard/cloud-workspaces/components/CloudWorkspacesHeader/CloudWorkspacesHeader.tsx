import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CloudWorkspaceSort } from "@superset/shared/cloud-workspace-groups";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
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
import { cn } from "@superset/ui/utils";
import {
	LuArchive,
	LuArrowDownUp,
	LuListFilter,
	LuTag,
	LuUsers,
} from "react-icons/lu";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { SubmenuValue } from "renderer/routes/_authenticated/_dashboard/components/SubmenuValue";
import {
	ProjectGlyph,
	TaskProjectIcon,
} from "renderer/routes/_authenticated/_dashboard/components/TaskProjectIcon";
import { ToolbarMenuButton } from "renderer/routes/_authenticated/_dashboard/components/ToolbarMenuButton";
import { WorkItemsSearch } from "renderer/routes/_authenticated/_dashboard/components/WorkItemsSearch";
import type { CloudWorkspaceGrouping } from "renderer/routes/_authenticated/_dashboard/stores/listDisplayStore";
import { NO_PROJECT } from "../../constants";
import type { CloudWorkspaceStatusFilter } from "../../types";

type Person = NonNullable<CloudWorkspaceRow["createdBy"]>;

interface Project {
	id: string;
	name: string;
	icon: string | null;
	color: string | null;
}

interface Label {
	id: string;
	name: string;
	color: string | null;
}

interface CloudWorkspacesHeaderProps {
	people: Person[];
	personIds: string[];
	projects: Project[];
	projectIds: string[];
	labels: Label[];
	labelIds: string[];
	status: CloudWorkspaceStatusFilter[];
	sort: CloudWorkspaceSort;
	groupBy: CloudWorkspaceGrouping;
	query: string;
	onPeopleChange: (personIds: string[]) => void;
	onProjectsChange: (projectIds: string[]) => void;
	onLabelsChange: (labelIds: string[]) => void;
	onStatusChange: (status: CloudWorkspaceStatusFilter[]) => void;
	onClearFilters: () => void;
	onSortChange: (sort: CloudWorkspaceSort) => void;
	onGroupByChange: (groupBy: CloudWorkspaceGrouping) => void;
	onQueryChange: (query: string) => void;
}

export function CloudWorkspacesHeader({
	people,
	personIds,
	projects,
	projectIds,
	labels,
	labelIds,
	status,
	sort,
	groupBy,
	query,
	onPeopleChange,
	onProjectsChange,
	onLabelsChange,
	onStatusChange,
	onClearFilters,
	onSortChange,
	onGroupByChange,
	onQueryChange,
}: CloudWorkspacesHeaderProps) {
	const { t } = useLingui();
	const projectOptions = [
		{
			id: NO_PROJECT,
			name: t({ message: "No project" }),
			icon: null,
			color: null,
		},
		...projects,
	];
	const chosenProjects = projectOptions.filter((option) =>
		projectIds.includes(option.id),
	);
	const chosenLabels = labels.filter((label) => labelIds.includes(label.id));
	const chosenPeople = people.filter((option) =>
		personIds.includes(option.userId),
	);
	const isDefaultStatus = status.length === 1 && status[0] === "active";
	const statusLabels: Record<CloudWorkspaceStatusFilter, string> = {
		active: t({ message: "Active" }),
		archived: t({ message: "Archived" }),
	};
	const toggle = <Value extends string>(list: Value[], value: Value) =>
		list.includes(value)
			? list.filter((item) => item !== value)
			: [...list, value];
	const activeFilterCount =
		(projectIds.length > 0 ? 1 : 0) +
		(labelIds.length > 0 ? 1 : 0) +
		(personIds.length > 0 ? 1 : 0) +
		(isDefaultStatus ? 0 : 1);
	const sortLabels: Record<CloudWorkspaceSort, string> = {
		activity: t({ message: "Last activity" }),
		created: t({ message: "Created" }),
	};
	const groupByLabels: Record<CloudWorkspaceGrouping, string> = {
		time: t({ message: "Time" }),
		person: t({ message: "Person" }),
		none: t({ message: "No grouping" }),
	};

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
						<DropdownMenuContent align="start" className="min-w-[14rem]">
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<span className="flex items-center gap-2">
										<ProjectGlyph className="size-3.5" />
										<Trans>Project</Trans>
									</span>
									{chosenProjects.length > 0 && (
										<SubmenuValue>
											{chosenProjects.length === 1
												? chosenProjects[0]?.name
												: t({
														message: plural(chosenProjects.length, {
															one: "# project",
															other: "# projects",
														}),
													})}
										</SubmenuValue>
									)}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="max-h-[60vh] min-w-0 overflow-y-auto">
									{projectOptions.map((option) => (
										<DropdownMenuCheckboxItem
											indicator="end"
											key={option.id}
											checked={projectIds.includes(option.id)}
											onSelect={(event) => event.preventDefault()}
											onCheckedChange={() =>
												onProjectsChange(toggle(projectIds, option.id))
											}
										>
											<span className="flex min-w-0 flex-1 items-center gap-2">
												<TaskProjectIcon
													icon={option.icon}
													color={option.color}
												/>
												<span className="min-w-0 truncate">{option.name}</span>
											</span>
										</DropdownMenuCheckboxItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<span className="flex items-center gap-2">
										<LuTag className="size-3.5" />
										<Trans>Label</Trans>
									</span>
									{chosenLabels.length > 0 && (
										<SubmenuValue>
											{chosenLabels.length === 1
												? chosenLabels[0]?.name
												: t({
														message: plural(chosenLabels.length, {
															one: "# label",
															other: "# labels",
														}),
													})}
										</SubmenuValue>
									)}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="max-h-[60vh] min-w-0 overflow-y-auto">
									{labels.map((label) => (
										<DropdownMenuCheckboxItem
											indicator="end"
											key={label.id}
											checked={labelIds.includes(label.id)}
											onSelect={(event) => event.preventDefault()}
											onCheckedChange={() =>
												onLabelsChange(toggle(labelIds, label.id))
											}
										>
											<span className="flex min-w-0 flex-1 items-center gap-2">
												<span
													className={cn(
														"size-2 shrink-0 rounded-full",
														!label.color && "bg-muted-foreground",
													)}
													style={
														label.color
															? { backgroundColor: label.color }
															: undefined
													}
												/>
												<span className="min-w-0 truncate">{label.name}</span>
											</span>
										</DropdownMenuCheckboxItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<span className="flex items-center gap-2">
										<LuUsers className="size-3.5" />
										<Trans>People</Trans>
									</span>
									{chosenPeople.length > 0 && (
										<SubmenuValue>
											{chosenPeople.length === 1
												? chosenPeople[0]?.name
												: t({
														message: plural(chosenPeople.length, {
															one: "# person",
															other: "# people",
														}),
													})}
										</SubmenuValue>
									)}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="max-h-[60vh] min-w-0 overflow-y-auto">
									{people.map((option) => (
										<DropdownMenuCheckboxItem
											indicator="end"
											key={option.userId}
											checked={personIds.includes(option.userId)}
											onSelect={(event) => event.preventDefault()}
											onCheckedChange={() =>
												onPeopleChange(toggle(personIds, option.userId))
											}
										>
											<span className="flex min-w-0 items-center gap-2">
												<AvatarStack
													people={[
														{
															id: option.userId,
															name: option.name,
															image: option.image,
														},
													]}
													size={16}
												/>
												<span className="min-w-0 truncate">{option.name}</span>
											</span>
										</DropdownMenuCheckboxItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<span className="flex items-center gap-2">
										<LuArchive className="size-3.5" />
										<Trans>Status</Trans>
									</span>
									{!isDefaultStatus && (
										<SubmenuValue>
											{status.map((filter) => statusLabels[filter]).join(", ")}
										</SubmenuValue>
									)}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="min-w-0">
									{(["active", "archived"] as const).map((filter) => (
										<DropdownMenuCheckboxItem
											indicator="end"
											key={filter}
											checked={status.includes(filter)}
											disabled={status.length === 1 && status[0] === filter}
											onSelect={(event) => event.preventDefault()}
											onCheckedChange={() =>
												onStatusChange(toggle(status, filter))
											}
										>
											{statusLabels[filter]}
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
						<DropdownMenuContent align="start" className="min-w-[12rem]">
							<DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
								<Trans>Sort by</Trans>
							</DropdownMenuLabel>
							<DropdownMenuRadioGroup
								value={sort}
								onValueChange={(value) =>
									onSortChange(value as CloudWorkspaceSort)
								}
							>
								{(["activity", "created"] as const).map((option) => (
									<DropdownMenuRadioItem key={option} value={option}>
										{sortLabels[option]}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
								<Trans>Group by</Trans>
							</DropdownMenuLabel>
							<DropdownMenuRadioGroup
								value={groupBy}
								onValueChange={(value) =>
									onGroupByChange(value as CloudWorkspaceGrouping)
								}
							>
								{(["time", "person", "none"] as const).map((option) => (
									<DropdownMenuRadioItem key={option} value={option}>
										{groupByLabels[option]}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					<WorkItemsSearch
						value={query}
						onChange={onQueryChange}
						placeholder={t({ message: "Search workspaces..." })}
						label={t({ message: "Search workspaces" })}
						containerClassName="@4xl:w-60 w-60"
					/>
				</>
			}
		/>
	);
}
