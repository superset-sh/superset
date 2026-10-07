import { expect, test } from "bun:test";
import {
	describeTriggerProblems,
	draftTriggerSchema,
} from "./automation-triggers";

test("GitLab draft defaults preserve old configurations while forbidding forks", () => {
	const draft = draftTriggerSchema.parse({
		config: { kind: "gitlab", event: "merge_request.opened" },
	});
	expect(draft.config).toEqual({
		kind: "gitlab",
		event: "merge_request.opened",
		projects: { mode: "any" },
		branches: { mode: "any" },
		labels: { mode: "any" },
		includeForks: false,
	});
	expect(
		draftTriggerSchema.safeParse({
			config: { ...draft.config, includeForks: true },
		}).success,
	).toBe(false);
	expect(
		draftTriggerSchema.safeParse({
			config: { ...draft.config, event: "unknown" },
		}).success,
	).toBe(false);
});
test("empty GitLab project selection reuses existing project validation", () => {
	const gitlab = draftTriggerSchema.parse({
		config: {
			kind: "gitlab",
			event: "push",
			projects: { mode: "list", ids: [] },
		},
	});
	const sentry = draftTriggerSchema.parse({
		config: {
			kind: "sentry",
			event: "issue.created",
			projects: { mode: "list", ids: [] },
		},
	});
	expect(describeTriggerProblems([gitlab])).toEqual(
		describeTriggerProblems([sentry]),
	);
	expect(describeTriggerProblems([gitlab])[0]?.field).toBe("projects");
	const any = draftTriggerSchema.parse({
		config: { kind: "gitlab", event: "push" },
	});
	expect(describeTriggerProblems([any])[0]?.field).toBe("projects");
});

test("GitLab event filters refuse configurations that can never match", () => {
	for (const config of [
		{ event: "issue.opened", branches: { mode: "list", ids: ["main"] } },
		{ event: "push", labels: { mode: "list", ids: ["ready"] } },
		{ event: "pipeline.success", labels: { mode: "list", ids: ["ready"] } },
	]) {
		const draft = draftTriggerSchema.parse({
			config: {
				kind: "gitlab",
				projects: { mode: "list", ids: ["group/repo"] },
				...config,
			},
		});
		expect(describeTriggerProblems([draft])).toHaveLength(1);
	}
	const valid = draftTriggerSchema.parse({
		config: {
			kind: "gitlab",
			event: "merge_request.opened",
			projects: { mode: "list", ids: ["group/repo"] },
			branches: { mode: "list", ids: ["main"] },
			labels: { mode: "list", ids: ["ready"] },
		},
	});
	expect(describeTriggerProblems([valid])).toEqual([]);
});
