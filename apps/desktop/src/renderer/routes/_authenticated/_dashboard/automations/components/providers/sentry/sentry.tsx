import { isEmptyScope } from "@superset/shared/automation-triggers";
import { SiSentry } from "react-icons/si";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { Sentence } from "../components/Sentence";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	SENTRY_MENU,
	SENTRY_SENTENCES,
	type SentryConfig,
	type Slot,
} from "./grammar";

/**
 * Sentry's severity levels. A fixed enum on Sentry's side, so it is listed here
 * rather than fetched — there is no per-organization variation to discover, and
 * a round trip would make the chip depend on a live connection to offer them.
 */
const SENTRY_LEVELS = [
	{ id: "fatal", label: "Fatal" },
	{ id: "error", label: "Error" },
	{ id: "warning", label: "Warning" },
	{ id: "info", label: "Info" },
	{ id: "debug", label: "Debug" },
];

function renderSlot(
	config: SentryConfig,
	slot: Slot,
	index: number,
	{ set, mark, options, state, disabled }: SentenceContext,
) {
	switch (slot) {
		case "projects":
			return (
				<ScopeChip
					key={index}
					scope={config.projects}
					onChange={(v) => set({ projects: v })}
					className={mark("projects")}
					options={options.sentry?.projects ?? []}
					emptyLabel="Select projects"
					anyLabel="Any project"
					state={state}
					disabled={disabled}
				/>
			);
		case "level":
			return (
				<ScopeChip
					key={index}
					scope={config.level}
					// Clearing an optional filter means "any", not "none": the chip
					// says "Any level" either way, and an empty list would make that
					// a lie.
					onChange={(v) =>
						set({ level: isEmptyScope(v) ? { mode: "any" } : v })
					}
					options={SENTRY_LEVELS}
					emptyLabel="Any level"
					anyLabel="Any level"
					disabled={disabled}
				/>
			);
	}
}

export const sentryProvider: TriggerProvider<SentryConfig> = {
	kind: "sentry",
	connectionProvider: "sentry",
	optionGroup: "sentry",
	label: "Sentry",
	icon: SiSentry,
	menu: SENTRY_MENU,
	renderSentence: (config, ctx) => (
		<Sentence
			parts={SENTRY_SENTENCES[config.event]}
			fallback={config.event}
			renderSlot={(slot, index) => renderSlot(config, slot, index, ctx)}
		/>
	),
};
