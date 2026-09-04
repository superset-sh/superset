import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { BsMicrosoftTeams } from "react-icons/bs";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { TextFilterChip } from "../../TriggerSentence/components/TextFilterChip";
import { Sentence } from "../components/Sentence";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	type MicrosoftTeamsConfig,
	type Slot,
	TEAMS_MENU,
	TEAMS_SENTENCES,
} from "./grammar";

function renderSlot(
	config: MicrosoftTeamsConfig,
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
					options={options.microsoftTeams?.teams ?? []}
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
		case "channels":
			return (
				<ScopeChip
					key={index}
					scope={config.channels}
					onChange={(v) => set({ channels: v })}
					className={mark("channels")}
					options={options.microsoftTeams?.channels ?? []}
					emptyLabel={i18n._(
						msg({
							message: "Select channels",
						}),
					)}
					anyLabel={i18n._(
						msg({
							message: "Any channel",
						}),
					)}
					state={state}
					disabled={disabled}
				/>
			);
		case "actor":
			return (
				<ScopeChip
					key={index}
					scope={config.actor}
					onChange={(v) => set({ actor: v })}
					className={mark("actor")}
					options={options.microsoftTeams?.people ?? []}
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
		case "messageFilter":
			return (
				<TextFilterChip
					key={index}
					value={config.messageFilter}
					onChange={(v) => set({ messageFilter: v })}
					emptyLabel={i18n._(
						msg({
							message: "Any message",
						}),
					)}
					placeholder={i18n._(
						msg({
							message: "Contains this text...",
						}),
					)}
					disabled={disabled}
				/>
			);
		case "nameFilter":
			return (
				<TextFilterChip
					key={index}
					value={config.messageFilter}
					onChange={(v) => set({ messageFilter: v })}
					emptyLabel={i18n._(
						msg({
							message: "Any name",
						}),
					)}
					placeholder={i18n._(
						msg({
							message: "Name contains...",
						}),
					)}
					disabled={disabled}
				/>
			);
	}
}

export const microsoftTeamsProvider: TriggerProvider<MicrosoftTeamsConfig> = {
	kind: "microsoft_teams",
	optionGroup: "microsoftTeams",
	label: "Microsoft Teams",
	icon: BsMicrosoftTeams,
	menu: TEAMS_MENU,
	renderSentence: (config, ctx) => (
		<Sentence
			parts={TEAMS_SENTENCES[config.event]}
			fallback={config.event}
			renderSlot={(slot, index) => renderSlot(config, slot, index, ctx)}
		/>
	),
};
