import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { normalizeLabelName } from "@superset/shared/labels";
import { toast } from "@superset/ui/sonner";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { CloudTask } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskRow";

export function useCloudWorkspaceMenuMutations(organizationId: string) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const listKey = { organizationId };
	type Rows = ReturnType<typeof utils.cloudWorkspace.list.getData>;
	type Links = ReturnType<typeof utils.cloudWorkspace.tasks.getData>;

	const fail = (error: unknown) =>
		toast.error(
			errorMessage(error, t({ message: "Couldn't save the change" })),
		);
	const refreshRecord = (id: string) => {
		void utils.cloudWorkspace.get.invalidate({ id });
		void utils.cloudWorkspace.activity.invalidate({ id });
	};

	const setProjectMutation = cloudTrpc.cloudWorkspace.setProject.useMutation();
	const linkTaskMutation = cloudTrpc.cloudWorkspace.linkTask.useMutation();
	const unlinkTaskMutation = cloudTrpc.cloudWorkspace.unlinkTask.useMutation();
	const addLabelMutation = cloudTrpc.cloudWorkspace.addLabel.useMutation();
	const removeLabelMutation =
		cloudTrpc.cloudWorkspace.removeLabel.useMutation();

	const updateLabels = (
		patch: (
			rows: NonNullable<ReturnType<typeof utils.cloudWorkspace.labels.getData>>,
		) => ReturnType<typeof utils.cloudWorkspace.labels.getData>,
	) => {
		void utils.cloudWorkspace.labels.cancel(listKey);
		const previous = utils.cloudWorkspace.labels.getData(listKey);
		if (previous) utils.cloudWorkspace.labels.setData(listKey, patch(previous));
		return previous;
	};
	const settleLabels = (id: string) => {
		void utils.cloudWorkspace.labels.invalidate(listKey);
		void utils.taskLabel.list.invalidate(listKey);
		refreshRecord(id);
	};

	const updateLinks = (patch: (links: NonNullable<Links>) => Links) => {
		void utils.cloudWorkspace.tasks.cancel(listKey);
		const previous = utils.cloudWorkspace.tasks.getData(listKey);
		if (previous) utils.cloudWorkspace.tasks.setData(listKey, patch(previous));
		return previous;
	};

	return {
		addLabel: (id: string, name: string) => {
			const normalized = normalizeLabelName(name);
			const known = utils.taskLabel.list
				.getData(listKey)
				?.find((label) => label.name === normalized);
			const previous = known
				? updateLabels((rows) => [
						...rows,
						{ cloudWorkspaceId: id, labelId: known.id },
					])
				: undefined;
			addLabelMutation.mutate(
				{ id, name },
				{
					onError: (error) => {
						if (previous)
							utils.cloudWorkspace.labels.setData(listKey, previous);
						fail(error);
					},
					onSettled: () => settleLabels(id),
				},
			);
		},
		removeLabel: (id: string, labelId: string) => {
			if (labelId.startsWith("pending:")) return;
			const previous = updateLabels((rows) =>
				rows.filter(
					(row) => !(row.cloudWorkspaceId === id && row.labelId === labelId),
				),
			);
			removeLabelMutation.mutate(
				{ id, labelId },
				{
					onError: (error) => {
						utils.cloudWorkspace.labels.setData(listKey, previous);
						fail(error);
					},
					onSettled: () => settleLabels(id),
				},
			);
		},
		setProject: (id: string, projectId: string | null) => {
			void utils.cloudWorkspace.list.cancel(listKey);
			const previous: Rows = utils.cloudWorkspace.list.getData(listKey);
			utils.cloudWorkspace.list.setData(listKey, (rows) =>
				rows?.map((row) => (row.id === id ? { ...row, projectId } : row)),
			);
			setProjectMutation.mutate(
				{ id, projectId },
				{
					onError: (error) => {
						utils.cloudWorkspace.list.setData(listKey, previous);
						fail(error);
					},
					onSettled: () => {
						void utils.cloudWorkspace.list.invalidate(listKey);
						void utils.taskProject.list.invalidate(listKey);
						refreshRecord(id);
					},
				},
			);
		},
		linkTask: (id: string, task: CloudTask) => {
			const previous = updateLinks((links) => [
				...links,
				{ cloudWorkspaceId: id, task },
			]);
			linkTaskMutation.mutate(
				{ id, taskId: task.id },
				{
					onError: (error) => {
						utils.cloudWorkspace.tasks.setData(listKey, previous);
						fail(error);
					},
					onSettled: () => {
						void utils.cloudWorkspace.tasks.invalidate(listKey);
						refreshRecord(id);
					},
				},
			);
		},
		unlinkTask: (id: string, taskId: string) => {
			const previous = updateLinks((links) =>
				links.filter(
					(link) => !(link.cloudWorkspaceId === id && link.task.id === taskId),
				),
			);
			unlinkTaskMutation.mutate(
				{ id, taskId },
				{
					onError: (error) => {
						utils.cloudWorkspace.tasks.setData(listKey, previous);
						fail(error);
					},
					onSettled: () => {
						void utils.cloudWorkspace.tasks.invalidate(listKey);
						refreshRecord(id);
					},
				},
			);
		},
	};
}
