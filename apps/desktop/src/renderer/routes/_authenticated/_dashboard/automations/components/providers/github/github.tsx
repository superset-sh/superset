import { configHasMeScope } from "@superset/shared/automation-matching";
import { isEmptyScope } from "@superset/shared/automation-triggers";
import { FaGithub } from "react-icons/fa";
import { env } from "renderer/env.renderer";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { TextFilterChip } from "../../TriggerSentence/components/TextFilterChip";
import { Sentence } from "../components/Sentence";
import type { SentenceContext, TriggerProvider } from "../types";
import { TypedScopeChip } from "./components/TypedScopeChip";
import { UserScopeChip } from "./components/UserScopeChip";
import {
	GITHUB_MENU,
	GITHUB_SENTENCES,
	type GithubConfig,
	type Slot,
} from "./grammar";

/**
 * Renders one slot of a GitHub sentence. Each slot names the config field it
 * edits, so `set` patches by that name and `mark` finds it in the problems.
 */
function renderSlot(
	config: GithubConfig,
	slot: Slot,
	index: number,
	{ set, mark, options, state, disabled }: SentenceContext,
) {
	// The slot list is derived from this event, so the fields it names are
	// present on this config member even where the union type cannot say so.
	const c = config as unknown as Record<string, never>;
	switch (slot) {
		case "repositories":
			return (
				<ScopeChip
					key={index}
					scope={c.repositories}
					onChange={(v) => set({ repositories: v })}
					className={mark("repositories")}
					options={options.github?.repositories ?? []}
					emptyLabel="Select repo"
					anyLabel="Any repo"
					// Saving already requires one of these, and the default is an empty
					// list so a half-built trigger matches nothing. Offering "any"
					// would undo both — it saves cleanly and fires on everything.
					allowAny={false}
					// One repository, because the branches and labels of a trigger are
					// only listable once it is known which repository they belong to.
					single
					countNoun={{ singular: "repository", plural: "repositories" }}
					// A repo missing from the roster means the GitHub App was never
					// granted it; the fix is the install flow, which lives in the
					// web app because that's where the browser session is.
					action={{
						label: "Add repositories",
						onSelect: () =>
							window.open(
								`${env.NEXT_PUBLIC_WEB_URL}/integrations/github`,
								"_blank",
							),
					}}
					state={state}
					disabled={disabled}
				/>
			);
		case "branches":
			return (
				<ScopeChip
					key={index}
					scope={c.branches}
					// Clearing an optional filter means "any", not "none": the chip
					// says "Any branch" either way, and an empty list would make that
					// a lie.
					onChange={(v) =>
						set({ branches: isEmptyScope(v) ? { mode: "any" } : v })
					}
					options={[]}
					emptyLabel="Any branch"
					anyLabel="Any branch"
					disabled={disabled}
				/>
			);
		case "labels":
			return (
				<TypedScopeChip
					key={index}
					scope={c.labels}
					onChange={(v) => set({ labels: v })}
					anyLabel="Any label"
					placeholder="Label name..."
					countNoun={{ singular: "label", plural: "labels" }}
					disabled={disabled}
				/>
			);
		case "actor":
			return (
				<UserScopeChip
					key={index}
					scope={c.actor}
					onChange={(v) => set({ actor: v })}
					className={mark("actor")}
					options={options.github?.people ?? []}
					disabled={disabled}
				/>
			);
		case "subjectAuthor":
			return (
				<UserScopeChip
					key={index}
					scope={c.subjectAuthor}
					onChange={(v) => set({ subjectAuthor: v })}
					className={mark("subjectAuthor")}
					options={options.github?.people ?? []}
					disabled={disabled}
				/>
			);
		case "assignee":
			return (
				<UserScopeChip
					key={index}
					scope={c.assignee}
					onChange={(v) => set({ assignee: v })}
					className={mark("assignee")}
					options={options.github?.people ?? []}
					disabled={disabled}
				/>
			);
		case "commentFilter":
			return (
				<TextFilterChip
					key={index}
					value={c.commentFilter}
					onChange={(v) => set({ commentFilter: v })}
					emptyLabel="Any comment"
					placeholder="Contains this text..."
					disabled={disabled}
				/>
			);
	}
}

export const githubProvider: TriggerProvider<GithubConfig> = {
	kind: "github",
	connectionProvider: "github",
	optionGroup: "github",
	label: "GitHub",
	icon: FaGithub,
	menu: GITHUB_MENU,
	renderSentence: (config, ctx) => (
		<Sentence
			parts={GITHUB_SENTENCES[config.event]}
			fallback={config.event}
			renderSlot={(slot, index) => renderSlot(config, slot, index, ctx)}
		/>
	),
	// "Me" resolves against the owner's GitHub identity when each event
	// arrives; with no identity connected it resolves to nobody and the
	// trigger is configured fine but permanently silent. The check reads the
	// viewer's identity — edits are owner-gated, so for the person who can
	// act on this they are the same account.
	runtimeWarnings: (config, options) => {
		if (!configHasMeScope(config)) return [];
		if ((options.github?.viewer ?? []).length > 0) return [];
		return [
			'This trigger filters by "Me", but no GitHub account is connected for you — it will not fire until one is.',
		];
	},
};
