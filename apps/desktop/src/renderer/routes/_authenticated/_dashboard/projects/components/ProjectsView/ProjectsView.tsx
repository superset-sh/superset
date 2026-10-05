import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { NewProjectDialog } from "renderer/routes/_authenticated/_dashboard/components/NewProjectDialog";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { useListDisplayStore } from "renderer/routes/_authenticated/_dashboard/stores/listDisplayStore";
import { useInviteMember } from "renderer/routes/_authenticated/hooks/useInviteMember";
import type { ProjectsSearch } from "../../types";
import { ProjectsHeader } from "./components/ProjectsHeader";
import { ProjectsList } from "./components/ProjectsList";

interface ProjectsViewProps {
	search: ProjectsSearch;
}

export function ProjectsView({ search }: ProjectsViewProps) {
	const { status = [], leads = [] } = search;
	const sort = useListDisplayStore((state) => state.projects.sort);
	const setDisplay = useListDisplayStore((state) => state.setProjectsDisplay);
	const [searchQuery, setSearchQuery] = useState("");
	const [isNewProjectOpen, onNewProjectOpenChange] = useState(false);
	const { t } = useLingui();
	const navigate = useNavigate();
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const { data: projects } = cloudTrpc.taskProject.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	const { people, currentUserId } = useOrganizationPeople();
	const inviteMember = useInviteMember();
	const setSearch = (patch: Partial<ProjectsSearch>) => {
		const next = { ...search, ...patch };
		navigate({
			to: "/projects",
			search: {
				...(next.status?.length ? { status: next.status } : {}),
				...(next.leads?.length ? { leads: next.leads } : {}),
			},
		});
	};
	const needle = searchQuery.trim().toLowerCase();
	const visible = (projects ?? []).filter(
		(project) =>
			(status.length === 0 || status.includes(project.state)) &&
			(leads.length === 0 || leads.includes(project.lead?.userId ?? "")) &&
			project.name.toLowerCase().includes(needle),
	);
	const listKey = { organizationId: organizationId ?? "" };
	const updateProject = cloudTrpc.taskProject.update.useMutation({
		onMutate: async ({ id, ...changes }) => {
			await utils.taskProject.list.cancel(listKey);
			const previous = utils.taskProject.list.getData(listKey);
			const lead =
				changes.leadUserId === undefined
					? undefined
					: (people
							.filter((person) => person.id === changes.leadUserId)
							.map((person) => ({
								userId: person.id,
								name: person.name,
								image: person.image,
							}))[0] ?? null);
			utils.taskProject.list.setData(listKey, (rows) =>
				rows?.map((row) =>
					row.id === id
						? {
								...row,
								...(changes.state ? { state: changes.state } : {}),
								...(changes.icon !== undefined ? { icon: changes.icon } : {}),
								...(changes.color !== undefined
									? { color: changes.color }
									: {}),
								...(changes.targetDate !== undefined
									? { targetDate: changes.targetDate }
									: {}),
								...(lead !== undefined ? { lead } : {}),
							}
						: row,
				),
			);
			return { previous };
		},
		onError: (error, _input, context) => {
			if (context?.previous)
				utils.taskProject.list.setData(listKey, context.previous);
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			);
		},
		onSettled: () => void utils.taskProject.list.invalidate(listKey),
	});
	const createProject = cloudTrpc.taskProject.create.useMutation({
		onSuccess: () => {
			void utils.taskProject.list.invalidate();
			onNewProjectOpenChange(false);
		},
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Could not create project" })),
			),
	});

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<ProjectsHeader
				query={searchQuery}
				onQueryChange={setSearchQuery}
				projects={projects ?? []}
				people={people}
				status={status}
				leads={leads}
				onStatusChange={(next) => setSearch({ status: next })}
				onLeadsChange={(next) => setSearch({ leads: next })}
				sort={sort}
				onSortChange={(next) => setDisplay({ sort: next })}
				onClearFilters={() =>
					setSearch({ status: undefined, leads: undefined })
				}
				onNewProject={() => onNewProjectOpenChange(true)}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{projects && (
					<ProjectsList
						projects={visible}
						sort={sort}
						isFiltered={
							needle.length > 0 || status.length > 0 || leads.length > 0
						}
						people={people}
						onInvite={inviteMember}
						onUpdate={(projectId, changes) =>
							updateProject.mutate({ id: projectId, ...changes })
						}
						onOpen={(projectId) =>
							navigate({ to: "/projects/$projectId", params: { projectId } })
						}
					/>
				)}
			</div>
			<NewProjectDialog
				open={isNewProjectOpen}
				people={people}
				onInvite={inviteMember}
				defaultLeadId={currentUserId}
				isCreating={createProject.isPending}
				onOpenChange={onNewProjectOpenChange}
				onCreate={(project) => {
					if (organizationId) {
						createProject.mutate({ organizationId, ...project });
					}
				}}
			/>
		</div>
	);
}
