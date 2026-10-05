import { Trans } from "@lingui/react/macro";
import { PROJECT_STATES } from "renderer/routes/_authenticated/_dashboard/components/ProjectStateIcon";
import type { ProjectSort } from "renderer/routes/_authenticated/_dashboard/stores/listDisplayStore";
import type { ProjectChanges, TaskProjectRow } from "../../types";
import { ProjectListRow } from "./components/ProjectListRow";

const COMPARE: Record<
	ProjectSort,
	(left: TaskProjectRow, right: TaskProjectRow) => number
> = {
	status: (left, right) =>
		PROJECT_STATES.indexOf(left.state) - PROJECT_STATES.indexOf(right.state),
	name: () => 0,
	target: (left, right) =>
		(left.targetDate ?? "9999").localeCompare(right.targetDate ?? "9999"),
	created: (left, right) =>
		right.createdAt.getTime() - left.createdAt.getTime(),
};

interface ProjectsListProps {
	projects: TaskProjectRow[];
	isFiltered: boolean;
	sort: ProjectSort;
	onOpen: (projectId: string) => void;
	people: { id: string; name: string; image: string | null }[];
	onInvite?: () => void;
	onUpdate: (projectId: string, changes: ProjectChanges) => void;
}

export function ProjectsList({
	projects,
	isFiltered,
	sort,
	onOpen,
	people,
	onInvite,
	onUpdate,
}: ProjectsListProps) {
	if (projects.length === 0) {
		return (
			<div className="p-8 text-sm text-muted-foreground">
				{isFiltered ? (
					<Trans>No projects match.</Trans>
				) : (
					<Trans>No projects yet.</Trans>
				)}
			</div>
		);
	}
	const sorted = [...projects].sort(
		(left, right) =>
			COMPARE[sort](left, right) || left.name.localeCompare(right.name),
	);
	return (
		<table className="w-full table-fixed border-collapse">
			<colgroup>
				<col />
				<col className="w-48" />
				<col className="w-24" />
				<col className="w-28" />
				<col className="w-28" />
				<col className="w-20" />
			</colgroup>
			<thead className="sticky top-0 z-10 bg-background">
				<tr className="h-9 border-b border-border/50 text-left text-xs font-normal text-muted-foreground">
					<th className="pr-3 pl-4 font-normal">
						<Trans>Name</Trans>
					</th>
					<th className="pr-4 font-normal">
						<Trans>Lead</Trans>
					</th>
					<th className="pr-4 font-normal">
						<Trans>Tasks</Trans>
					</th>
					<th className="pr-4 font-normal">
						<Trans>Workspaces</Trans>
					</th>
					<th className="pr-4 font-normal">
						<Trans>Target date</Trans>
					</th>
					<th className="pr-4 font-normal">
						<Trans>Status</Trans>
					</th>
				</tr>
			</thead>
			<tbody>
				{sorted.map((project) => (
					<ProjectListRow
						key={project.id}
						project={project}
						onOpen={() => onOpen(project.id)}
						people={people}
						onInvite={onInvite}
						onUpdate={(changes) => onUpdate(project.id, changes)}
					/>
				))}
			</tbody>
		</table>
	);
}
