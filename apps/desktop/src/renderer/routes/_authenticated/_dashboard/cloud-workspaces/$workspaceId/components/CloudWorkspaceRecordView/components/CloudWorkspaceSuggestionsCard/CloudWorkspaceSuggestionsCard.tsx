import { Trans, useLingui } from "@lingui/react/macro";
import { LuLightbulb } from "react-icons/lu";
import { useTaskDisplayId } from "renderer/hooks/useTaskDisplayId";
import { CloudTaskIcon } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskIcon";
import { CloudWorkspaceLabelDot } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspaceLabelDot";
import { TaskProjectIcon } from "renderer/routes/_authenticated/_dashboard/components/TaskProjectIcon";
import type { CloudWorkspaceRecordSuggestion } from "../../../../types";
import { CloudWorkspaceSuggestionChip } from "./components/CloudWorkspaceSuggestionChip";
import { CloudWorkspaceSuggestionsRow } from "./components/CloudWorkspaceSuggestionsRow";

type TaskSuggestion = Extract<
	CloudWorkspaceRecordSuggestion,
	{ kind: "link_task" }
>;
type ProjectSuggestion = Extract<
	CloudWorkspaceRecordSuggestion,
	{ kind: "set_project" }
>;
type LabelSuggestion = Extract<
	CloudWorkspaceRecordSuggestion,
	{ kind: "add_label" }
>;

interface CloudWorkspaceSuggestionsCardProps {
	suggestions: CloudWorkspaceRecordSuggestion[];
	onAccept: (suggestionId: string) => void;
	onDismiss: (suggestionId: string) => void;
}

export function CloudWorkspaceSuggestionsCard({
	suggestions,
	onAccept,
	onDismiss,
}: CloudWorkspaceSuggestionsCardProps) {
	const taskDisplayId = useTaskDisplayId();
	const { t } = useLingui();
	if (suggestions.length === 0) return null;
	const tasks = suggestions.filter(
		(s): s is TaskSuggestion => s.kind === "link_task",
	);
	const projects = suggestions.filter(
		(s): s is ProjectSuggestion => s.kind === "set_project",
	);
	const labels = suggestions.filter(
		(s): s is LabelSuggestion => s.kind === "add_label",
	);
	return (
		<section className="mt-5 max-w-[760px] rounded-xl border border-border px-4 pt-3 pb-2.5">
			<div className="mb-2 flex items-center gap-2 text-[13px] font-medium">
				<LuLightbulb className="size-4 text-muted-foreground" />
				<Trans>Suggestions</Trans>
			</div>
			{tasks.length > 0 && (
				<CloudWorkspaceSuggestionsRow label={<Trans>Tasks</Trans>}>
					{tasks.map((suggestion) => (
						<CloudWorkspaceSuggestionChip
							key={suggestion.id}
							acceptLabel={t({ message: "Link this task" })}
							onAccept={() => onAccept(suggestion.id)}
							onDismiss={() => onDismiss(suggestion.id)}
						>
							<CloudTaskIcon task={suggestion.task} />
							<span className="shrink-0 font-mono text-muted-foreground">
								{taskDisplayId(suggestion.task)}
							</span>
							<span className="min-w-0 truncate">{suggestion.task.title}</span>
						</CloudWorkspaceSuggestionChip>
					))}
				</CloudWorkspaceSuggestionsRow>
			)}
			{projects.length > 0 && (
				<CloudWorkspaceSuggestionsRow label={<Trans>Project</Trans>}>
					{projects.map((suggestion) => (
						<CloudWorkspaceSuggestionChip
							key={suggestion.id}
							acceptLabel={t({ message: "Set this project" })}
							onAccept={() => onAccept(suggestion.id)}
							onDismiss={() => onDismiss(suggestion.id)}
						>
							<TaskProjectIcon
								icon={suggestion.project.icon}
								color={suggestion.project.color}
							/>
							<span className="min-w-0 truncate">
								{suggestion.project.name}
							</span>
						</CloudWorkspaceSuggestionChip>
					))}
				</CloudWorkspaceSuggestionsRow>
			)}
			{labels.length > 0 && (
				<CloudWorkspaceSuggestionsRow label={<Trans>Labels</Trans>}>
					{labels.map((suggestion) => (
						<CloudWorkspaceSuggestionChip
							key={suggestion.id}
							acceptLabel={t({ message: "Add this label" })}
							onAccept={() => onAccept(suggestion.id)}
							onDismiss={() => onDismiss(suggestion.id)}
						>
							<CloudWorkspaceLabelDot color={suggestion.label.color} />
							<span className="min-w-0 truncate">{suggestion.label.name}</span>
						</CloudWorkspaceSuggestionChip>
					))}
				</CloudWorkspaceSuggestionsRow>
			)}
		</section>
	);
}
