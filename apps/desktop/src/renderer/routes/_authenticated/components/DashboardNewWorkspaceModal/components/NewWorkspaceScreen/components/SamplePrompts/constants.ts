import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface SamplePrompt {
	id: string;
	/** Short row label shown in the UI, and the card title. */
	label: MessageDescriptor;
	/** Card-only supporting line; the row layout shows the label alone. */
	description: MessageDescriptor;
	/** Full instruction inserted into the composer on click. */
	prompt: string;
}

/**
 * Every prompt we can show. Order here carries no meaning — the tier lists
 * below decide what appears and in what order.
 */
export const SAMPLE_PROMPTS: Record<string, SamplePrompt> = {
	"set-up-project": {
		id: "set-up-project",
		label: msg({
			message: "Set up this project for Superset",
		}),
		description: msg({
			message:
				"Write setup and teardown scripts so every new workspace starts ready to run.",
		}),
		prompt: `Set up this repository to work well with Superset workspaces. Read https://docs.superset.sh/setup-teardown-scripts and create a .superset/config.json with: setup commands that install dependencies and copy untracked files (like .env) from "$SUPERSET_ROOT_PATH" into new workspaces, teardown commands that stop anything setup starts, and a run command that launches the dev server. If parallel workspaces would collide on dev-server ports, make the scripts pick a free port per workspace (see https://docs.superset.sh/ports). When you're done, summarize what you configured and how to use it.`,
	},
	"explain-repo": {
		id: "explain-repo",
		label: msg({
			message: "Explain to me how this repository works",
		}),
		description: msg({
			message:
				"Get an architecture tour: entry points, how to run it, what to read first.",
		}),
		prompt:
			"Explain how this repository works: the overall architecture, the main entry points, how to run it locally, and what I should read first to get productive. Keep it practical and concrete.",
	},
	"fix-small-bug": {
		id: "fix-small-bug",
		label: msg({
			message: "Find and fix a small bug",
		}),
		description: msg({
			message:
				"Pick a low-risk papercut, fix it, and explain how it was verified.",
		}),
		prompt:
			"Find a small, low-risk bug or papercut in this codebase and fix it. Keep the change minimal, explain what the bug was, and describe how you verified the fix.",
	},
	"add-missing-tests": {
		id: "add-missing-tests",
		label: msg({
			message: "Add tests where they're missing",
		}),
		description: msg({
			message:
				"Find recently changed code with weak coverage and test it properly.",
		}),
		prompt:
			"Look at recently changed or complex code in this repository that lacks test coverage. Pick the highest-risk gap, write focused tests for it following the project's existing test conventions, and make sure they pass. Explain what you covered and why it mattered most.",
	},
	"improve-agent-docs": {
		id: "improve-agent-docs",
		label: msg({
			message: "Improve the agent instructions",
		}),
		description: msg({
			message:
				"Audit AGENTS.md / CLAUDE.md against the codebase and fill the gaps.",
		}),
		prompt:
			"Review this repository's agent instruction files (AGENTS.md, CLAUDE.md, or similar). Compare them against how the codebase actually works today: commands, structure, conventions. Fix anything stale, and add the few things a coding agent most often needs and can't easily discover. Create the file if none exists. Keep it concise.",
	},
	"clean-up-todos": {
		id: "clean-up-todos",
		label: msg({
			message: "Knock out some TODOs",
		}),
		description: msg({
			message: "Find stale TODO/FIXME comments and resolve the quick ones.",
		}),
		prompt:
			"Search this codebase for TODO and FIXME comments. Triage them: resolve the ones that are quick and low-risk, delete the ones that are obsolete, and list the ones that need a real project. Keep each fix minimal and explain what you did.",
	},
	"explain-superset": {
		id: "explain-superset",
		label: msg({
			message: "Get more out of Superset",
		}),
		description: msg({
			message:
				"Learn the workflow that fits this repo — parallel workspaces and agent setup.",
		}),
		prompt:
			"Read https://docs.superset.sh and figure out how I should be using Superset for this specific repository. Cover how to run several workspaces in parallel without them colliding, what belongs in .superset/config.json, and which agent settings suit this codebase. Be concrete about this repo rather than generic, and end with the two or three changes worth making first.",
	},
};

/**
 * Which prompts an audience sees, in order.
 *
 * `first-run` is orientation for someone who has not shipped anything yet.
 * `returning` swaps the orientation prompts for real work once they have a
 * workspace behind them — repeating "find a small bug" at someone who just
 * watched an agent do exactly that wastes the slot.
 *
 * Both lists are five long on purpose: an arm shows at most four, and the
 * setup prompt drops out once the project is configured, which shifts
 * everything up one and makes the fifth entry reachable.
 */
export const SAMPLE_PROMPT_TIERS = {
	"first-run": [
		"set-up-project",
		"explain-repo",
		"fix-small-bug",
		"add-missing-tests",
		"improve-agent-docs",
	],
	returning: [
		"set-up-project",
		"explain-superset",
		"improve-agent-docs",
		"add-missing-tests",
		"clean-up-todos",
	],
} satisfies Record<string, string[]>;

export type SamplePromptTier = keyof typeof SAMPLE_PROMPT_TIERS;

/**
 * The prompts an arm should show, in order. Every arm slices a prefix of the
 * same tier list, so arms differ only in how many they show and how they are
 * laid out — never in content.
 *
 * `needsSetup` is the project's `shouldShowSetupCard` verdict: pitching setup
 * at a project that already has setup/teardown/run commands reads as noise, so
 * it is dropped rather than demoted.
 */
export function selectSamplePrompts(
	tier: SamplePromptTier,
	needsSetup: boolean,
	count: number,
): SamplePrompt[] {
	return SAMPLE_PROMPT_TIERS[tier]
		.filter((id) => id !== "set-up-project" || needsSetup)
		.slice(0, count)
		.map((id) => SAMPLE_PROMPTS[id] as SamplePrompt);
}

/**
 * Composer ghost text: one is picked per screen-open so the empty state
 * suggests a concrete next action instead of a static question.
 */
export const PROMPT_PLACEHOLDERS: MessageDescriptor[] = [
	msg({
		message: "What do you want to do?",
	}),
	msg({
		message: "Find a small bug and fix it…",
	}),
	msg({
		message: "Add tests for the riskiest untested code…",
	}),
	msg({
		message: "Explain how this repository works…",
	}),
	msg({
		message: "Track down that flaky test…",
	}),
	msg({
		message: "Upgrade a dependency and fix what breaks…",
	}),
	msg({
		message: "Clean up stale TODOs…",
	}),
	msg({
		message: "Write docs for the part everyone asks about…",
	}),
];
