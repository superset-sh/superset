import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
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

function renderSlot(
	config: SentryConfig,
	slot: Slot,
	index: number,
	{ set, mark, options, disabled }: SentenceContext,
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
					emptyLabel={i18n._(
						msg({
							id: "dashboard.automations.providers.sentry.selectProjects",
							message: "Select projects",
						}),
					)}
					anyLabel={i18n._(
						msg({
							id: "dashboard.automations.providers.sentry.anyProject",
							message: "Any project",
						}),
					)}
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
					options={options.sentry?.levels ?? []}
					emptyLabel={i18n._(
						msg({
							id: "dashboard.automations.providers.sentry.anyLevelEmpty",
							message: "Any level",
						}),
					)}
					anyLabel={i18n._(
						msg({
							id: "dashboard.automations.providers.sentry.anyLevel",
							message: "Any level",
						}),
					)}
					disabled={disabled}
				/>
			);
	}
}

export const sentryProvider: TriggerProvider<SentryConfig> = {
	kind: "sentry",
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
