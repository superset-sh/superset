import type { GitlabTriggerEvent, TriggerScope } from "../automation-triggers";
import { parseGitRemote } from "../git-remote";
import {
	type BaseMatchableEvent,
	type MatchResult,
	no,
	scopeAllows,
	scopeAllowsAny,
} from "./core";

export type GitlabMatchableEvent = BaseMatchableEvent & {
	provider: "gitlab";
	host: string | null;
	repositoryId: string | null;
	projectPath: string | null;
	ref: string | null;
	labels: string[];
	isFork: boolean | null;
	mergeRequest: {
		sourceProjectId: string | null;
		targetProjectId: string | null;
	} | null;
	names: GitlabTriggerEvent[];
};

function positiveId(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^[1-9]\d*$/.test(value) &&
		Number.isSafeInteger(Number(value))
	);
}
function projectIdentity(host: unknown, path: unknown): boolean {
	if (
		typeof host !== "string" ||
		typeof path !== "string" ||
		/[\s%\\?#:]/.test(path) ||
		Array.from(path).some(
			(character) =>
				character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
		) ||
		path.split("/").length < 2 ||
		path
			.split("/")
			.some((segment) => !segment || segment === "." || segment === "..")
	)
		return false;
	try {
		const url = new URL(`https://${host}`);
		return (
			url.host === host &&
			url.pathname === "/" &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash
		);
	} catch {
		return false;
	}
}
function sameProject(
	repositoryId: unknown,
	sourceId: unknown,
	targetId: unknown,
): boolean {
	return (
		positiveId(repositoryId) &&
		positiveId(sourceId) &&
		positiveId(targetId) &&
		sourceId === targetId &&
		targetId === repositoryId
	);
}

export function gitlabAutomationCheckoutNumber(
	cloneUrl: string | null | undefined,
	input: unknown,
): number | null {
	if (!cloneUrl || !input || typeof input !== "object") return null;
	const payload = input as Record<string, unknown>;
	const parsed = parseGitRemote(cloneUrl);
	if (
		!parsed ||
		parsed.provider === "github" ||
		payload.fork !== false ||
		typeof payload.iid !== "number" ||
		!Number.isSafeInteger(payload.iid) ||
		payload.iid <= 0 ||
		!projectIdentity(payload.host, payload.projectPath) ||
		!sameProject(
			payload.repositoryId,
			payload.sourceProjectId,
			payload.targetProjectId,
		)
	)
		return null;
	const mrEvent =
		payload.objectKind === "merge_request" ||
		payload.objectKind === "pipeline" ||
		(payload.objectKind === "note" && payload.noteableType === "MergeRequest");
	if (
		!mrEvent ||
		payload.host !== parsed.host ||
		payload.projectPath !== `${parsed.owner}/${parsed.name}`
	)
		return null;
	return payload.iid;
}

export function gitlabEventNames(input: {
	objectKind: string;
	action: string | null;
	draft: boolean;
	merged: boolean;
	noteableType: string | null;
	pipelineStatus: string | null;
	labelsChanged?: boolean;
	commitsPushed?: boolean;
}): GitlabTriggerEvent[] {
	if (input.objectKind === "merge_request") {
		if (input.action === "open")
			return input.draft
				? ["merge_request.draft_opened"]
				: ["merge_request.opened"];
		if (input.action === "approved" || input.action === "approval")
			return ["merge_request.approved"];
		if (input.action === "unapproved" || input.action === "unapproval")
			return ["merge_request.unapproved"];
		if (input.action === "merge" || (input.action === "update" && input.merged))
			return ["merge_request.merged"];
		if (input.action === "update") {
			const names: GitlabTriggerEvent[] = [];
			if (input.labelsChanged === true)
				names.push("merge_request.label_change");
			if (input.commitsPushed === true) names.push("merge_request.pushed");
			return names;
		}
	}
	if (input.objectKind === "note") return ["note.added"];
	if (input.objectKind === "push") return ["push"];
	if (input.objectKind === "issue" && input.action === "open")
		return ["issue.opened"];
	if (input.objectKind === "pipeline") {
		if (input.pipelineStatus === "success") return ["pipeline.success"];
		if (input.pipelineStatus === "failed") return ["pipeline.failed"];
		if (input.pipelineStatus === "canceled") return ["pipeline.canceled"];
	}
	return [];
}

export function gitlabTriggerMatches(
	config: {
		event: string;
		projects: TriggerScope;
		branches: TriggerScope;
		labels: TriggerScope;
		includeForks: boolean;
	},
	event: GitlabMatchableEvent,
): MatchResult {
	if (!event.names.includes(config.event as GitlabTriggerEvent))
		return no("event");
	if (
		!positiveId(event.repositoryId) ||
		!projectIdentity(event.host, event.projectPath)
	)
		return no("project");
	if (
		event.isFork !== false ||
		(event.names.some((name) => name.startsWith("merge_request.")) &&
			!event.mergeRequest) ||
		(event.mergeRequest &&
			!sameProject(
				event.repositoryId,
				event.mergeRequest.sourceProjectId,
				event.mergeRequest.targetProjectId,
			))
	)
		return no("fork");
	if (!scopeAllows(config.projects, event.projectPath)) return no("project");
	if (!scopeAllows(config.branches, event.ref)) return no("branch");
	if (!scopeAllowsAny(config.labels, event.labels)) return no("label");
	return { matches: true };
}
