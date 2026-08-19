import { isEmptyScope } from "@superset/shared/automation-triggers";
import { FaGithub } from "react-icons/fa";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { TextFilterChip } from "../../TriggerSentence/components/TextFilterChip";
import { Sentence } from "../components/Sentence";
import type { SentenceContext, TriggerProvider } from "../types";
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
	{ set, mark, options, disabled }: SentenceContext,
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
					emptyLabel="Select repos"
					anyLabel="Any repo"
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
				<ScopeChip
					key={index}
					scope={c.labels}
					onChange={(v) =>
						set({ labels: isEmptyScope(v) ? { mode: "any" } : v })
					}
					options={[]}
					emptyLabel="Any label"
					anyLabel="Any label"
					disabled={disabled}
				/>
			);
		case "actor":
			return (
				<ScopeChip
					key={index}
					scope={c.actor}
					onChange={(v) => set({ actor: v })}
					className={mark("actor")}
					options={options.github?.people ?? []}
					emptyLabel="Select people"
					anyLabel="Anyone"
					disabled={disabled}
				/>
			);
		case "subjectAuthor":
			return (
				<ScopeChip
					key={index}
					scope={c.subjectAuthor}
					onChange={(v) => set({ subjectAuthor: v })}
					className={mark("subjectAuthor")}
					options={options.github?.people ?? []}
					emptyLabel="Select people"
					anyLabel="Anyone"
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
};
