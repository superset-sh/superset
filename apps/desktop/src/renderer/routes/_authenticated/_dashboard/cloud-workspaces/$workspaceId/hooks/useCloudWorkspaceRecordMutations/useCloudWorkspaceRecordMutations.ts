import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { ENTITY_COLORS } from "@superset/shared/entity-colors";
import { normalizeLabelName } from "@superset/shared/labels";
import { toast } from "@superset/ui/sonner";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const PENDING_LABEL_PREFIX = "pending:";

export function useCloudWorkspaceRecordMutations(workspaceId: string) {
	const { t } = useLingui();
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const recordKey = { id: workspaceId };
	const suggestionsKey = { cloudWorkspaceId: workspaceId };
	type Record = NonNullable<
		ReturnType<typeof utils.cloudWorkspace.get.getData>
	>;
	type Suggestion = NonNullable<
		ReturnType<typeof utils.suggestion.listForCloudWorkspace.getData>
	>[number];

	const optimistic = <Input>(
		patch: (
			input: Input,
			record: Record,
			suggestions: Suggestion[],
		) => { record?: Record; suggestions?: Suggestion[] },
	) => ({
		onMutate: async (input: Input) => {
			await Promise.all([
				utils.cloudWorkspace.get.cancel(recordKey),
				utils.suggestion.listForCloudWorkspace.cancel(suggestionsKey),
			]);
			const record = utils.cloudWorkspace.get.getData(recordKey);
			const suggestions =
				utils.suggestion.listForCloudWorkspace.getData(suggestionsKey);
			if (record) {
				const next = patch(input, record, suggestions ?? []);
				if (next.record)
					utils.cloudWorkspace.get.setData(recordKey, next.record);
				if (next.suggestions) {
					utils.suggestion.listForCloudWorkspace.setData(
						suggestionsKey,
						next.suggestions,
					);
				}
			}
			return { record, suggestions };
		},
		onError: (
			error: unknown,
			_input: Input,
			context?: { record?: Record; suggestions?: Suggestion[] },
		) => {
			if (context?.record)
				utils.cloudWorkspace.get.setData(recordKey, context.record);
			if (context?.suggestions) {
				utils.suggestion.listForCloudWorkspace.setData(
					suggestionsKey,
					context.suggestions,
				);
			}
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			);
		},
		onSettled: () => {
			void utils.cloudWorkspace.get.invalidate(recordKey);
			void utils.cloudWorkspace.activity.invalidate(recordKey);
			void utils.cloudWorkspace.tasks.invalidate();
			void utils.cloudWorkspace.labels.invalidate();
			void utils.suggestion.listForCloudWorkspace.invalidate(suggestionsKey);
		},
	});

	const knownLabel = (name: string) =>
		organizationId
			? utils.taskLabel.list
					.getData({ organizationId })
					?.find((label) => label.name === name)
			: undefined;
	const knownProject = (projectId: string) =>
		organizationId
			? utils.taskProject.list
					.getData({ organizationId })
					?.find((project) => project.id === projectId)
			: undefined;

	const rename = cloudTrpc.cloudWorkspace.rename.useMutation({
		...optimistic<{ id: string; name: string }>(({ name }, record) => ({
			record: { ...record, name },
		})),
		onSettled: () => {
			void utils.cloudWorkspace.get.invalidate(recordKey);
			void utils.cloudWorkspace.activity.invalidate(recordKey);
			void utils.cloudWorkspace.list.invalidate();
		},
	});

	const setDescription = cloudTrpc.cloudWorkspace.setDescription.useMutation(
		optimistic<{ id: string; description: string }>(
			({ description }, record) => ({
				record: { ...record, description: description || null },
			}),
		),
	);

	const addLabel = cloudTrpc.cloudWorkspace.addLabel.useMutation({
		...optimistic<{ id: string; name: string }>(({ name }, record) => {
			const normalized = normalizeLabelName(name);
			if (
				!normalized ||
				record.labels.some((label) => label.name === normalized)
			) {
				return {};
			}
			const label = knownLabel(normalized) ?? {
				id: `${PENDING_LABEL_PREFIX}${normalized}`,
				name: normalized,
				color: ENTITY_COLORS[0],
			};
			return { record: { ...record, labels: [...record.labels, label] } };
		}),
		onSuccess: () => void utils.taskLabel.list.invalidate(),
	});

	const removeLabelMutation = cloudTrpc.cloudWorkspace.removeLabel.useMutation(
		optimistic<{ id: string; labelId: string }>(({ labelId }, record) => ({
			record: {
				...record,
				labels: record.labels.filter((label) => label.id !== labelId),
			},
		})),
	);
	const removeLabel = (labelId: string) => {
		if (labelId.startsWith(PENDING_LABEL_PREFIX)) return;
		removeLabelMutation.mutate({ id: workspaceId, labelId });
	};

	const setProject = cloudTrpc.cloudWorkspace.setProject.useMutation(
		optimistic<{ id: string; projectId: string | null }>(
			({ projectId }, record) => {
				const project = projectId ? knownProject(projectId) : undefined;
				return {
					record: {
						...record,
						project: project
							? {
									id: project.id,
									name: project.name,
									icon: project.icon,
									color: project.color,
								}
							: null,
					},
				};
			},
		),
	);

	const unlinkTask = cloudTrpc.cloudWorkspace.unlinkTask.useMutation(
		optimistic<{ id: string; taskId: string }>(({ taskId }, record) => ({
			record: {
				...record,
				tasks: record.tasks.filter((task) => task.id !== taskId),
			},
		})),
	);

	const dismissSuggestion = cloudTrpc.suggestion.dismiss.useMutation(
		optimistic<{ id: string }>(({ id }, _record, suggestions) => ({
			suggestions: suggestions.filter((suggestion) => suggestion.id !== id),
		})),
	);

	const acceptSuggestion = cloudTrpc.suggestion.accept.useMutation(
		optimistic<{ id: string }>(({ id }, record, suggestions) => {
			const accepted = suggestions.find((suggestion) => suggestion.id === id);
			const remaining = suggestions.filter(
				(suggestion) => suggestion.id !== id,
			);
			if (!accepted) return { suggestions: remaining };
			switch (accepted.kind) {
				case "link_task":
					return {
						suggestions: remaining,
						record: record.tasks.some((task) => task.id === accepted.task.id)
							? record
							: { ...record, tasks: [...record.tasks, accepted.task] },
					};
				case "set_project":
					return {
						suggestions: remaining,
						record: { ...record, project: accepted.project },
					};
				case "add_label":
					return {
						suggestions: remaining,
						record: record.labels.some(
							(label) => label.id === accepted.label.id,
						)
							? record
							: { ...record, labels: [...record.labels, accepted.label] },
					};
			}
		}),
	);

	return {
		rename,
		setDescription,
		addLabel,
		removeLabel,
		setProject,
		unlinkTask,
		acceptSuggestion,
		dismissSuggestion,
	};
}
