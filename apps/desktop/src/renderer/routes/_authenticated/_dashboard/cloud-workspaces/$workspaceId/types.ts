import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import type { CloudTask } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskRow";
import type { RecordLabel } from "renderer/routes/_authenticated/_dashboard/components/RecordLabels";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";

type Person = NonNullable<CloudWorkspaceRow["createdBy"]>;

export type CloudWorkspaceRecordActor =
	| { kind: "user"; person: Person }
	| { kind: "system" };

export interface CloudWorkspaceRecordProject {
	id: string;
	name: string;
	icon: string | null;
	color: string | null;
}

export type CloudWorkspaceRecord = Pick<
	CloudWorkspaceRow,
	| "id"
	| "name"
	| "status"
	| "agentStatus"
	| "agentStatusAt"
	| "createdAt"
	| "createdBy"
	| "presence"
	| "archivedAt"
	| "visibility"
> & {
	environmentName: string;
	repositories: { fullName: string; branch: string }[];
	prompt: string | null;
	labels: RecordLabel[];
	project: CloudWorkspaceRecordProject | null;
	description: string | null;
};

export type CloudWorkspaceRecordSuggestion = { id: string; source: string } & (
	| { kind: "link_task"; task: CloudTask }
	| { kind: "set_project"; project: CloudWorkspaceRecordProject }
	| { kind: "add_label"; label: RecordLabel }
);

export interface CloudWorkspaceRecordAttachment {
	id: string;
	name: string;
	contentType: string;
	url: string | null;
	createdAt: Date;
}

export interface CloudWorkspaceRecordPage {
	id: string;
	title: string;
	thumbnailUrl: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export type CloudWorkspaceTimelineEvent =
	| { kind: "created" }
	| { kind: "joined" }
	| { kind: "renamed"; from: string; to: string }
	| {
			kind: "visibility";
			from: "just_me" | "org" | null;
			to: "just_me" | "org";
	  }
	| { kind: "description_edited" }
	| {
			kind: "project_changed";
			from: CloudWorkspaceRecordProject | null;
			project: CloudWorkspaceRecordProject | null;
	  }
	| { kind: "label_added"; label: RecordLabel }
	| { kind: "label_removed"; label: RecordLabel }
	| {
			kind: "task_linked";
			task: CloudTask;
			suggestedBy: Person | null;
	  }
	| {
			kind: "task_unlinked";
			task: CloudTask;
	  }
	| {
			kind: "pull_request_opened";
			pullRequest: CloudPullRequest;
	  }
	| {
			kind: "page_published";
			page: Pick<CloudWorkspaceRecordPage, "id" | "title">;
	  }
	| { kind: "archived" }
	| { kind: "unarchived" };

export type CloudWorkspaceTimelineEntry = CloudWorkspaceTimelineEvent & {
	id: string;
	at: Date;
	actor: CloudWorkspaceRecordActor;
};
