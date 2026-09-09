import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { isEmptyScope } from "@superset/shared/automation-triggers";
import { SiNotion } from "react-icons/si";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { Sentence } from "../components/Sentence";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	NOTION_MENU,
	NOTION_SENTENCES,
	type NotionConfig,
	type Slot,
} from "./grammar";

function renderSlot(
	config: NotionConfig,
	slot: Slot,
	index: number,
	{ set, mark, options, state, disabled }: SentenceContext,
) {
	// The slot list is derived from this event, so the fields it names are
	// present on this config member even where the union type cannot say so.
	const c = config as unknown as Record<string, never>;
	switch (slot) {
		case "dataSources":
			return (
				<ScopeChip
					key={index}
					scope={c.dataSources}
					onChange={(v) => set({ dataSources: v })}
					className={mark("dataSources")}
					options={options.notion?.dataSources ?? []}
					emptyLabel={i18n._(
						msg({
							message: "Select data sources",
						}),
					)}
					anyLabel={i18n._(
						msg({
							message: "Any data source",
						}),
					)}
					state={state}
					disabled={disabled}
				/>
			);
		case "pages":
			return (
				<ScopeChip
					key={index}
					scope={c.pages}
					// Clearing an optional filter means "any", not "none".
					onChange={(v) =>
						set({ pages: isEmptyScope(v) ? { mode: "any" } : v })
					}
					options={[]}
					emptyLabel={i18n._(
						msg({
							message: "Any page",
						}),
					)}
					anyLabel={i18n._(
						msg({
							message: "Any page",
						}),
					)}
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
					options={options.notion?.people ?? []}
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
		case "mentionedUser":
			return (
				<ScopeChip
					key={index}
					scope={c.mentionedUser}
					onChange={(v) => set({ mentionedUser: v })}
					className={mark("mentionedUser")}
					options={options.notion?.people ?? []}
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

export const notionProvider: TriggerProvider<NotionConfig> = {
	kind: "notion",
	optionGroup: "notion",
	label: "Notion",
	icon: SiNotion,
	menu: NOTION_MENU,
	renderSentence: (config, ctx) => (
		<Sentence
			parts={NOTION_SENTENCES[config.event]}
			fallback={config.event}
			renderSlot={(slot, index) => renderSlot(config, slot, index, ctx)}
		/>
	),
};
