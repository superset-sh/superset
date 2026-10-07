import { expect, test } from "bun:test";
import type { TriggerScope } from "../automation-triggers";
import {
	type GitlabMatchableEvent,
	gitlabAutomationCheckoutNumber,
	gitlabEventNames,
	gitlabTriggerMatches,
} from "./gitlab";
import { triggerMatches } from "./index";

const config = {
	kind: "gitlab" as const,
	event: "merge_request.opened" as const,
	projects: { mode: "any" } as const,
	branches: { mode: "any" } as const,
	labels: { mode: "any" } as const,
	includeForks: false as const,
};
const event: GitlabMatchableEvent = {
	provider: "gitlab" as const,
	eventType: "merge_request.opened",
	actorId: "4",
	actorLogin: "actor",
	body: null,
	host: "git.example.invalid:8443",
	repositoryId: "17",
	projectPath: "team/sub/widget",
	ref: "main",
	labels: ["ready"],
	isFork: false,
	mergeRequest: { sourceProjectId: "17", targetProjectId: "17" },
	names: ["merge_request.opened" as const],
};
test("GitLab dispatches only through its own provider and preserves selected filters", () => {
	expect(gitlabTriggerMatches(config, event)).toEqual({ matches: true });
	expect(triggerMatches(config, event)).toEqual({ matches: true });
	expect(triggerMatches({ kind: "webhook" }, event).matches).toBe(false);
	expect(
		gitlabTriggerMatches(
			{ ...config, projects: { mode: "list", ids: ["team/sub/widget"] } },
			event,
		).matches,
	).toBe(true);
	const refusals: ["projects" | "branches" | "labels", TriggerScope, string][] =
		[
			["projects", { mode: "list", ids: ["other/widget"] }, "project"],
			["branches", { mode: "list", ids: ["release"] }, "branch"],
			["labels", { mode: "list", ids: ["other"] }, "label"],
		];
	for (const [field, value, reason] of refusals)
		expect(gitlabTriggerMatches({ ...config, [field]: value }, event)).toEqual({
			matches: false,
			reason,
		});
	expect(
		gitlabTriggerMatches({ ...config, event: "push" }, event).matches,
	).toBe(false);
});
test("fork and unknown fork provenance fail closed even with a tampered config", () => {
	for (const isFork of [true, null, undefined])
		expect(
			gitlabTriggerMatches({ ...config, includeForks: true }, {
				...event,
				isFork,
			} as GitlabMatchableEvent).matches,
		).toBe(false);
});
test("missing, malformed or mismatched project identity cannot dispatch a wildcard trigger", () => {
	for (const changed of [
		{ repositoryId: null },
		{ repositoryId: "0" },
		{ repositoryId: "17.5" },
		{ repositoryId: "9007199254740992" },
		{ host: null },
		{ host: "git.example.invalid/path" },
		{ host: "user@git.example.invalid" },
		{ projectPath: null },
		{ projectPath: "team/../widget" },
		{ projectPath: "team/%2e%2e/widget" },
		{ mergeRequest: null },
		{ mergeRequest: { sourceProjectId: null, targetProjectId: "17" } },
		{ mergeRequest: { sourceProjectId: "18", targetProjectId: "17" } },
		{ mergeRequest: { sourceProjectId: "18", targetProjectId: "18" } },
	])
		expect(gitlabTriggerMatches(config, { ...event, ...changed }).matches).toBe(
			false,
		);
});
test("non-MR events require project identity and proven nonfork but no MR identifiers", () => {
	const pipeline = {
		...event,
		names: ["pipeline.success" as const],
		eventType: "pipeline.success",
		mergeRequest: null,
	};
	expect(
		gitlabTriggerMatches({ ...config, event: "pipeline.success" }, pipeline)
			.matches,
	).toBe(true);
	expect(
		gitlabTriggerMatches(
			{
				...config,
				event: "pipeline.success",
				branches: { mode: "list", ids: ["main"] },
			},
			pipeline,
		).matches,
	).toBe(true);
	expect(
		gitlabTriggerMatches(
			{ ...config, event: "pipeline.success" },
			{ ...pipeline, isFork: null },
		).matches,
	).toBe(false);
	expect(
		gitlabTriggerMatches(
			{ ...config, event: "pipeline.success" },
			{
				...pipeline,
				mergeRequest: { sourceProjectId: null, targetProjectId: null },
			},
		).matches,
	).toBe(false);
});
const names = (
	objectKind: string,
	overrides: Partial<Parameters<typeof gitlabEventNames>[0]> = {},
) =>
	gitlabEventNames({
		objectKind,
		action: null,
		draft: false,
		merged: false,
		noteableType: null,
		pipelineStatus: null,
		...overrides,
	});
test("retained GitLab actions map precisely and updates only name actual changes", () => {
	for (const [action, expected] of [
		["open", "merge_request.opened"],
		["approved", "merge_request.approved"],
		["approval", "merge_request.approved"],
		["unapproved", "merge_request.unapproved"],
		["unapproval", "merge_request.unapproved"],
		["merge", "merge_request.merged"],
	] as const)
		expect(names("merge_request", { action })).toEqual([expected]);
	expect(names("merge_request", { action: "open", draft: true })).toEqual([
		"merge_request.draft_opened",
	]);
	expect(names("merge_request", { action: "update", merged: true })).toEqual([
		"merge_request.merged",
	]);
	expect(names("merge_request", { action: "update" })).toEqual([]);
	expect(
		names("merge_request", {
			action: "update",
			labelsChanged: true,
			commitsPushed: true,
		}),
	).toEqual(["merge_request.label_change", "merge_request.pushed"]);
	expect(names("merge_request", { action: "close" })).toEqual([]);
	for (const [kind, overrides, expected] of [
		["note", {}, "note.added"],
		["push", {}, "push"],
		["issue", { action: "open" }, "issue.opened"],
		["pipeline", { pipelineStatus: "success" }, "pipeline.success"],
		["pipeline", { pipelineStatus: "failed" }, "pipeline.failed"],
		["pipeline", { pipelineStatus: "canceled" }, "pipeline.canceled"],
	] as const)
		expect(names(kind, overrides)).toEqual([expected]);
	expect(names("pipeline", { pipelineStatus: "running" })).toEqual([]);
	expect(names("unknown")).toEqual([]);
});
const checkout = {
	iid: 12,
	fork: false,
	host: event.host,
	projectPath: event.projectPath,
	repositoryId: "17",
	sourceProjectId: "17",
	targetProjectId: "17",
	objectKind: "merge_request",
	noteableType: null,
};
test("checkout requires exact clone host including port, namespace, positive IID and nonfork project proof", () => {
	const clone = "https://git.example.invalid:8443/team/sub/widget.git";
	expect(gitlabAutomationCheckoutNumber(clone, checkout)).toBe(12);
	expect(
		gitlabAutomationCheckoutNumber("git@gitlab.com:team/sub/widget.git", {
			...checkout,
			host: "gitlab.com",
		}),
	).toBe(12);
	for (const kind of [
		{ objectKind: "pipeline" },
		{ objectKind: "note", noteableType: "MergeRequest" },
	])
		expect(
			gitlabAutomationCheckoutNumber(clone, { ...checkout, ...kind }),
		).toBe(12);
	for (const changed of [
		{ iid: null },
		{ iid: "12" },
		{ iid: 0 },
		{ iid: 1.5 },
		{ iid: Number.MAX_SAFE_INTEGER + 1 },
		{ fork: true },
		{ fork: null },
		{ host: "git.example.invalid" },
		{ projectPath: "team/widget" },
		{ repositoryId: null },
		{ sourceProjectId: null },
		{ targetProjectId: "18" },
		{ sourceProjectId: "18", targetProjectId: "18" },
		{ objectKind: "push" },
		{ objectKind: "note", noteableType: "Issue" },
	])
		expect(
			gitlabAutomationCheckoutNumber(clone, { ...checkout, ...changed }),
		).toBeNull();
	expect(
		gitlabAutomationCheckoutNumber("https://github.com/team/widget.git", {
			...checkout,
			host: "github.com",
			projectPath: "team/widget",
		}),
	).toBeNull();
	expect(gitlabAutomationCheckoutNumber(null, checkout)).toBeNull();
});
