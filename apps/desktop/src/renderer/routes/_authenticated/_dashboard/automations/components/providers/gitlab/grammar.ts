import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type {
	GitlabTriggerEvent,
	TriggerConfigInput,
} from "@superset/shared/automation-triggers";
import type { TriggerMenuEntry } from "../types";

export type GitlabConfig = Extract<TriggerConfigInput, { kind: "gitlab" }>;

export const GITLAB_EVENTS: Record<GitlabTriggerEvent, MessageDescriptor> = {
	"merge_request.opened": msg({ message: "Merge request opened" }),
	"merge_request.draft_opened": msg({ message: "Draft merge request opened" }),
	"merge_request.pushed": msg({ message: "Merge request pushed" }),
	"merge_request.merged": msg({ message: "Merge request merged" }),
	"merge_request.approved": msg({ message: "Merge request approved" }),
	"merge_request.unapproved": msg({
		message: "Merge request approval removed",
	}),
	"merge_request.label_change": msg({ message: "Merge request label changed" }),
	"note.added": msg({ message: "Note added" }),
	push: msg({ context: "GitLab trigger", message: "Push" }),
	"issue.opened": msg({ message: "Issue opened" }),
	"pipeline.success": msg({ message: "Pipeline succeeded" }),
	"pipeline.failed": msg({ message: "Pipeline failed" }),
	"pipeline.canceled": msg({ message: "Pipeline canceled" }),
};

export function createGitlabConfig(event: GitlabTriggerEvent): GitlabConfig {
	return {
		kind: "gitlab",
		event,
		projects: { mode: "list", ids: [] },
		branches: { mode: "any" },
		labels: { mode: "any" },
		includeForks: false,
	};
}

export const GITLAB_MENU: TriggerMenuEntry<GitlabConfig>[] = Object.entries(
	GITLAB_EVENTS,
).map(([event, label]) => ({
	label,
	create: () => createGitlabConfig(event as GitlabTriggerEvent),
}));
