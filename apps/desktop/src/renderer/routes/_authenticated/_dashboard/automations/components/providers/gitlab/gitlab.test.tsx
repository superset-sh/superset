import { beforeEach, expect, mock, test } from "bun:test";
import { draftTriggerSchema } from "@superset/shared/automation-triggers";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ScopeChip } from "../../TriggerSentence/components/ScopeChip";

const chips: Array<ComponentProps<typeof ScopeChip>> = [];
mock.module("../../TriggerSentence/components/ScopeChip", () => ({
	ScopeChip: (props: ComponentProps<typeof ScopeChip>) => {
		chips.push(props);
		return (
			<button type="button" disabled={props.disabled}>
				{props.emptyLabel}
			</button>
		);
	},
}));
const { connectorFor, providerFor, TRIGGER_PROVIDERS } = await import(
	"../index"
);
beforeEach(() => {
	chips.length = 0;
});

const config = draftTriggerSchema.parse({
	config: {
		kind: "gitlab",
		event: "merge_request.opened",
		projects: { mode: "list", ids: ["Team/Subgroup/Widget"] },
		branches: { mode: "any" },
		labels: { mode: "any" },
		includeForks: false,
	},
}).config;

test("a persisted native GitLab trigger has an editable provider", () => {
	const provider = providerFor(config);
	expect(provider.kind).toBe("gitlab");
	expect(provider.optionGroup).toBe("gitlab");
	expect(connectorFor(provider)).toBe("gitlab");
	expect(typeof provider.renderSentence).toBe("function");
});

test("registering native GitLab preserves the original provider menu order", () => {
	expect(
		TRIGGER_PROVIDERS.filter((provider) => provider.kind !== "gitlab").map(
			(provider) => provider.kind,
		),
	).toEqual([
		"schedule",
		"github",
		"slack",
		"microsoft_teams",
		"sentry",
		"linear",
		"webhook",
		"notion",
		"gmail",
	]);
	const github = draftTriggerSchema.parse({
		config: {
			kind: "github",
			event: "pull_request.opened",
			repositories: { mode: "list", ids: ["123"] },
			branches: { mode: "any" },
			labels: { mode: "any" },
			actor: { mode: "any" },
		},
	}).config;
	expect(providerFor(github).kind).toBe("github");
	expect(providerFor(github).optionGroup).toBe("github");
});

test("every retained native event creates the original safe draft shape", () => {
	const provider = providerFor(config);
	expect(provider.menu).toHaveLength(13);
	const events: string[] = [];
	for (const entry of provider.menu) {
		if (!("create" in entry)) throw new Error("Expected native event leaf");
		const draft = entry.create();
		if (draft.kind !== "gitlab")
			throw new Error("Expected native GitLab config");
		expect(draftTriggerSchema.parse({ config: draft }).config).toEqual(draft);
		expect(draft).toMatchObject({
			kind: "gitlab",
			projects: { mode: "list", ids: [] },
			branches: { mode: "any" },
			labels: { mode: "any" },
			includeForks: false,
		});
		events.push(draft.event);
	}
	expect(events).toEqual([
		"merge_request.opened",
		"merge_request.draft_opened",
		"merge_request.pushed",
		"merge_request.merged",
		"merge_request.approved",
		"merge_request.unapproved",
		"merge_request.label_change",
		"note.added",
		"push",
		"issue.opened",
		"pipeline.success",
		"pipeline.failed",
		"pipeline.canceled",
	]);
});

test("actual native sentence edits full project paths and clears optional filters", () => {
	const writes: Record<string, unknown>[] = [];
	const state = { isLoading: false, isError: true, refetch: mock(() => {}) };
	const options = {
		gitlab: {
			projects: [{ id: "Team/Subgroup/Widget", label: "Widget" }],
			branches: [{ id: "Feature", label: "Feature" }],
			labels: [{ id: "ready", label: "ready" }],
		},
	};
	const html = renderToStaticMarkup(
		providerFor(config).renderSentence(config, {
			set: (patch) => writes.push(patch),
			mark: (field) => `invalid-${field}`,
			options,
			state,
			disabled: true,
		}),
	);
	expect(html).toContain("Merge request opened");
	expect(chips).toHaveLength(3);
	const [projects, branches, labels] = chips;
	if (!projects || !branches || !labels)
		throw new Error("Expected native scope controls");
	expect(projects.allowAny).toBe(false);
	expect(projects.className).toBe("invalid-projects");
	expect(projects.options).toEqual(options.gitlab.projects);
	expect(branches.options).toEqual(options.gitlab.branches);
	expect(labels.options).toEqual(options.gitlab.labels);
	for (const chip of chips) {
		expect(Object.is(chip.state, state)).toBe(true);
		expect(chip.disabled).toBe(true);
	}
	projects.onChange({ mode: "list", ids: ["Team/Subgroup/Other"] });
	branches.onChange({ mode: "list", ids: [] });
	labels.onChange({ mode: "list", ids: [] });
	expect(writes).toEqual([
		{ projects: { mode: "list", ids: ["Team/Subgroup/Other"] } },
		{ branches: { mode: "any" } },
		{ labels: { mode: "any" } },
	]);
});
