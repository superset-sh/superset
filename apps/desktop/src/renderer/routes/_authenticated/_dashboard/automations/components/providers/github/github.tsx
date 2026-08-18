import { FaGithub } from "react-icons/fa";
import { ActorChip } from "../../TriggerSentence/components/ActorChip";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { TextFilterChip } from "../../TriggerSentence/components/TextFilterChip";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	GITHUB_MENU,
	GITHUB_SENTENCES,
	type GithubConfig,
	type SentencePart,
} from "./grammar";

/**
 * Renders one slot of a GitHub sentence. Each slot names the config field it
 * edits, so `set` patches by that name and `mark` finds it in the problems.
 */
function renderPart(
	config: GithubConfig,
	part: SentencePart,
	index: number,
	{ set, mark, options, disabled }: SentenceContext,
) {
	if ("text" in part) {
		return (
			<span key={index} className="text-[13px] text-muted-foreground">
				{part.text}
			</span>
		);
	}
	// The slot list is derived from this event, so the fields it names are
	// present on this config member even where the union type cannot say so.
	const c = config as unknown as Record<string, never>;
	switch (part.slot) {
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
					// says "Any branch" either way, and null would make that a lie.
					onChange={(v) => set({ branches: v ?? { mode: "any" } })}
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
					onChange={(v) => set({ labels: v ?? { mode: "any" } })}
					options={[]}
					emptyLabel="Any label"
					anyLabel="Any label"
					disabled={disabled}
				/>
			);
		case "actor":
			return (
				<ActorChip
					key={index}
					actor={c.actor}
					onChange={(v) => set({ actor: v })}
					className={mark("actor")}
					people={options.github?.people ?? []}
					disabled={disabled}
				/>
			);
		case "subjectAuthor":
			return (
				<ActorChip
					key={index}
					actor={c.subjectAuthor}
					onChange={(v) => set({ subjectAuthor: v })}
					className={mark("subjectAuthor")}
					people={options.github?.people ?? []}
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
	label: "GitHub",
	icon: FaGithub,
	menu: GITHUB_MENU,
	renderSentence: (config, ctx) => {
		// The event comes from a persisted config. If its grammar entry is ever
		// removed or renamed, the row must still render — a thrown error here
		// takes the whole editor down with it — so an unknown event reads as
		// its raw name rather than as nothing.
		const parts = GITHUB_SENTENCES[config.event];
		if (!parts) {
			return (
				<span className="text-[13px] text-muted-foreground">
					{config.event}
				</span>
			);
		}
		return parts.map((part, index) => renderPart(config, part, index, ctx));
	},
};
