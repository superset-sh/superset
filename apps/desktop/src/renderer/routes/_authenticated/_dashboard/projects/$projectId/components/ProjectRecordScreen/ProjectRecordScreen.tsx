import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useNow } from "renderer/hooks/useNow";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { useCloudWorkspaceListItems } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudWorkspaceListItems";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { sortCloudWorkspaces } from "renderer/routes/_authenticated/_dashboard/utils/groupCloudWorkspaces";
import { useInviteMember } from "renderer/routes/_authenticated/hooks/useInviteMember";
import type { ProjectRecord, ProjectTab } from "../../types";
import { ProjectRecordView } from "../ProjectRecordView";

const NOW_TICK_MS = 30_000;

interface ProjectRecordScreenProps {
	projectId: string;
	tab: ProjectTab;
}

export function ProjectRecordScreen({
	projectId,
	tab,
}: ProjectRecordScreenProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const now = useNow(NOW_TICK_MS);
	const utils = cloudTrpc.useUtils();
	const { people } = useOrganizationPeople();
	const inviteMember = useInviteMember();
	const { workspaces: allWorkspaces = [] } = useCloudWorkspaces();
	const projectWorkspaces = allWorkspaces.filter(
		(workspace) => workspace.projectId === projectId,
	);
	const listItems = useCloudWorkspaceListItems(projectWorkspaces);
	const key = { id: projectId };
	const project = cloudTrpc.taskProject.get.useQuery(key);
	const createdTasks = useRef(
		new Map<string, { id: string; slug: string; title: string }>(),
	);

	const optimistic = <Input,>(
		patch: (input: Input, record: ProjectRecord) => ProjectRecord,
	) => ({
		onMutate: async (input: Input) => {
			await utils.taskProject.get.cancel(key);
			const previous = utils.taskProject.get.getData(key);
			if (previous) utils.taskProject.get.setData(key, patch(input, previous));
			return { previous };
		},
		onError: (
			error: unknown,
			_input: Input,
			context?: { previous?: ProjectRecord },
		) => {
			if (context?.previous)
				utils.taskProject.get.setData(key, context.previous);
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			);
		},
		onSettled: () => {
			void utils.taskProject.get.invalidate(key);
			void utils.taskProject.list.invalidate();
		},
	});

	const update = cloudTrpc.taskProject.update.useMutation(
		optimistic<Parameters<typeof utils.client.taskProject.update.mutate>[0]>(
			({ id: _id, leadUserId, ...changes }, record) => {
				const defined = Object.fromEntries(
					Object.entries(changes).filter(([, value]) => value !== undefined),
				);
				const lead =
					leadUserId === undefined
						? record.lead
						: (people.find((person) => person.id === leadUserId) ?? null);
				return { ...record, ...defined, lead };
			},
		),
	);
	const addTask = cloudTrpc.taskProject.addTask.useMutation(
		optimistic<{ id: string; taskId: string }>(({ taskId }, record) => {
			const task = createdTasks.current.get(taskId);
			return task
				? {
						...record,
						tasks: [{ ...task, status: null, assignee: null }, ...record.tasks],
					}
				: record;
		}),
	);

	if (!project.data) return <StateScreenShell />;

	return (
		<ProjectRecordView
			project={project.data}
			tab={tab}
			now={now}
			people={people}
			onInvite={inviteMember}
			onTabChange={(next) =>
				void navigate({
					to: "/projects/$projectId",
					params: { projectId },
					search: next === "progress" ? { tab: "progress" } : {},
				})
			}
			onBack={() => void navigate({ to: "/projects" })}
			onChange={(changes) => update.mutate({ id: projectId, ...changes })}
			onAddTask={(task) => {
				createdTasks.current.set(task.id, task);
				addTask.mutate({ id: projectId, taskId: task.id });
			}}
			onOpenTask={(taskId) =>
				void navigate({ to: "/tasks/$taskId", params: { taskId } })
			}
			workspaceItems={sortCloudWorkspaces(projectWorkspaces, "activity").map(
				listItems.toItem,
			)}
			onOpenPullRequest={listItems.onOpenPullRequest}
			onOpenRepo={listItems.onOpenRepo}
			onSetInSidebar={listItems.onSetInSidebar}
			onOpenWorkspace={(workspaceId) =>
				void navigate({
					to: "/cloud-workspaces/$workspaceId",
					params: { workspaceId },
				})
			}
		/>
	);
}
