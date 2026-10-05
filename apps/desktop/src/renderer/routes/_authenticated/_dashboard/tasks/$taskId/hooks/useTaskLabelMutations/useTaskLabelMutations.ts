import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { ENTITY_COLORS } from "@superset/shared/entity-colors";
import { normalizeLabelName } from "@superset/shared/labels";
import { toast } from "@superset/ui/sonner";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { RecordLabel } from "renderer/routes/_authenticated/_dashboard/components/RecordLabels";

export function useTaskLabelMutations(taskId: string) {
	const { t } = useLingui();
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const labelsKey = { taskId };

	const optimistic = <Input>(
		patch: (input: Input, labels: RecordLabel[]) => RecordLabel[],
	) => ({
		onMutate: async (input: Input) => {
			await utils.taskRecord.labels.cancel(labelsKey);
			const previous = utils.taskRecord.labels.getData(labelsKey);
			if (previous) {
				utils.taskRecord.labels.setData(labelsKey, patch(input, previous));
			}
			return { previous };
		},
		onError: (
			error: unknown,
			_input: Input,
			context?: { previous?: RecordLabel[] },
		) => {
			if (context?.previous) {
				utils.taskRecord.labels.setData(labelsKey, context.previous);
			}
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			);
		},
		onSettled: () => {
			void utils.taskRecord.labels.invalidate(labelsKey);
			void utils.taskRecord.timeline.invalidate(labelsKey);
			void utils.taskLabel.list.invalidate();
			void utils.task.invalidate();
		},
	});

	const knownLabel = (name: string) =>
		organizationId
			? utils.taskLabel.list
					.getData({ organizationId })
					?.find((label) => label.name === name)
			: undefined;

	const addLabel = cloudTrpc.taskRecord.addLabel.useMutation(
		optimistic<{ taskId: string; name: string }>(({ name }, labels) => {
			const normalized = normalizeLabelName(name);
			if (!normalized || labels.some((label) => label.name === normalized)) {
				return labels;
			}
			const label = knownLabel(normalized) ?? {
				id: `pending:${normalized}`,
				name: normalized,
				color: ENTITY_COLORS[0],
			};
			return [...labels, label].sort((a, b) => a.name.localeCompare(b.name));
		}),
	);

	const removeLabelMutation = cloudTrpc.taskRecord.removeLabel.useMutation(
		optimistic<{ taskId: string; labelId: string }>(({ labelId }, labels) =>
			labels.filter((label) => label.id !== labelId),
		),
	);
	const removeLabel = (labelId: string) => {
		if (labelId.startsWith("pending:")) return;
		removeLabelMutation.mutate({ taskId, labelId });
	};

	return { addLabel, removeLabel };
}
