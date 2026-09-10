import { configHasMeScope } from "@superset/shared/automation-matching";
import { FaGithub } from "react-icons/fa";
import { Sentence } from "../components/Sentence";
import type { TriggerProvider } from "../types";
import { GithubSentenceSlot } from "./components/GithubSentenceSlot";
import { GITHUB_MENU, GITHUB_SENTENCES, type GithubConfig } from "./grammar";

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
			renderSlot={(slot, index) => (
				<GithubSentenceSlot
					config={config}
					slot={slot}
					index={index}
					context={ctx}
				/>
			)}
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
