import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { isEmptyScope } from "@superset/shared/automation-triggers";
import { SiLinear } from "react-icons/si";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { Sentence } from "../components/Sentence";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	LINEAR_MENU,
	LINEAR_SENTENCES,
	type LinearConfig,
	type Slot,
} from "./grammar";

/** Renders one slot of a Linear sentence; each slot edits the field it names. */
function renderSlot(
	config: LinearConfig,
	slot: Slot,
	index: number,
	{ set, mark, options, state, disabled }: SentenceContext,
) {
	switch (slot) {
		case "teams":
			return (
				<ScopeChip
					key={index}
					scope={config.teams}
					onChange={(v) => set({ teams: v })}
					className={mark("teams")}
					options={options.linear?.teams ?? []}
					emptyLabel={i18n._(
						msg({
							message: "Select teams",
						}),
					)}
					anyLabel={i18n._(
						msg({
							message: "Any team",
						}),
					)}
					state={state}
					disabled={disabled}
				/>
			);
		case "projects":
			return (
				<ScopeChip
					key={index}
					scope={config.projects}
					// Clearing an optional filter means "any", not "none": the chip
					// says "Any project" either way, and an empty list would make
					// that a lie.
					onChange={(v) =>
						set({ projects: isEmptyScope(v) ? { mode: "any" } : v })
					}
					options={options.linear?.projects ?? []}
					emptyLabel={i18n._(
						msg({
							message: "Any project",
						}),
					)}
					anyLabel={i18n._(
						msg({
							message: "Any project",
						}),
					)}
					state={state}
					disabled={disabled}
				/>
			);
		case "labels":
			return (
				<ScopeChip
					key={index}
					scope={config.labels}
					onChange={(v) =>
						set({ labels: isEmptyScope(v) ? { mode: "any" } : v })
					}
					options={options.linear?.labels ?? []}
					emptyLabel={i18n._(
						msg({
							message: "Any label",
						}),
					)}
					anyLabel={i18n._(
						msg({
							message: "Any label",
						}),
					)}
					state={state}
					disabled={disabled}
				/>
			);
		case "toStatus":
			return (
				<ScopeChip
					key={index}
					scope={config.toStatus}
					onChange={(v) =>
						set({ toStatus: isEmptyScope(v) ? { mode: "any" } : v })
					}
					options={options.linear?.statuses ?? []}
					emptyLabel={i18n._(
						msg({
							message: "Any status",
						}),
					)}
					anyLabel={i18n._(
						msg({
							message: "Any status",
						}),
					)}
					state={state}
					disabled={disabled}
				/>
			);
		case "assignee":
			return (
				<ScopeChip
					key={index}
					scope={config.assignee}
					onChange={(v) => set({ assignee: v })}
					className={mark("assignee")}
					options={options.linear?.people ?? []}
					emptyLabel={i18n._(
						msg({
							message: "Select people",
						}),
					)}
					anyLabel={i18n._(
						msg({
							message: "Anyone",
						}),
					)}
					state={state}
					disabled={disabled}
				/>
			);
	}
}

export const linearProvider: TriggerProvider<LinearConfig> = {
	kind: "linear",
	optionGroup: "linear",
	label: "Linear",
	icon: SiLinear,
	menu: LINEAR_MENU,
	renderSentence: (config, ctx) => (
		<Sentence
			parts={LINEAR_SENTENCES[config.event]}
			fallback={config.event}
			renderSlot={(slot, index) => renderSlot(config, slot, index, ctx)}
		/>
	),
};
