import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { isEmptyScope } from "@superset/shared/automation-triggers";
import { LuMic } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { EndpointChip } from "../../TriggerSentence/components/EndpointChip";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { TextFilterChip } from "../../TriggerSentence/components/TextFilterChip";
import { Sentence } from "../components/Sentence";
import type { SentenceContext, TriggerProvider } from "../types";
import { SigningSecretChip } from "./components/SigningSecretChip";
import {
	CIRCLEBACK_MENU,
	CIRCLEBACK_SENTENCE,
	type CirclebackConfig,
	type Slot,
} from "./grammar";

export function circlebackWebhookUrl(triggerId: string): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/integrations/circleback/webhook/${triggerId}`;
}

function renderSlot(
	config: CirclebackConfig,
	slot: Slot,
	index: number,
	{ set, disabled, triggerId }: SentenceContext,
) {
	switch (slot) {
		case "tags":
			return (
				<ScopeChip
					key={index}
					scope={config.tags}
					// Clearing an optional filter means "any", not "none": the chip
					// says "Any tag" either way, and an empty list would make that a
					// lie.
					onChange={(v) => set({ tags: isEmptyScope(v) ? { mode: "any" } : v })}
					options={[]}
					emptyLabel={i18n._(
						msg({
							id: "dashboard.automations.providers.circleback.anyTagEmpty",
							message: "Any tag",
						}),
					)}
					anyLabel={i18n._(
						msg({
							id: "dashboard.automations.providers.circleback.anyTag",
							message: "Any tag",
						}),
					)}
					allowCustom={{
						placeholder: i18n._(
							msg({
								id: "dashboard.automations.providers.circleback.tagPlaceholder",
								message: "Type a tag, press Enter",
							}),
						),
					}}
					disabled={disabled}
				/>
			);
		case "attendees":
			return (
				<ScopeChip
					key={index}
					scope={config.attendees}
					onChange={(v) =>
						set({ attendees: isEmptyScope(v) ? { mode: "any" } : v })
					}
					options={[]}
					emptyLabel={i18n._(
						msg({
							id: "dashboard.automations.providers.circleback.anyAttendeeEmpty",
							message: "Any attendee",
						}),
					)}
					anyLabel={i18n._(
						msg({
							id: "dashboard.automations.providers.circleback.anyAttendee",
							message: "Any attendee",
						}),
					)}
					allowCustom={{
						placeholder: i18n._(
							msg({
								id: "dashboard.automations.providers.circleback.emailPlaceholder",
								message: "Type an email, press Enter",
							}),
						),
					}}
					disabled={disabled}
				/>
			);
		case "nameFilter":
			return (
				<TextFilterChip
					key={index}
					value={config.nameFilter}
					onChange={(v) => set({ nameFilter: v })}
					emptyLabel={i18n._(
						msg({
							id: "dashboard.automations.providers.circleback.anyName",
							message: "Any name",
						}),
					)}
					placeholder={i18n._(
						msg({
							id: "dashboard.automations.providers.circleback.nameFilterPlaceholder",
							message: "Contains this text...",
						}),
					)}
					disabled={disabled}
				/>
			);
		case "endpoint":
			// The URL carries the saved row's id, so a row that has not been
			// saved yet has nothing to paste into Circleback.
			return (
				<EndpointChip
					key={index}
					url={triggerId ? circlebackWebhookUrl(triggerId) : null}
				/>
			);
		case "signingSecret":
			return (
				<SigningSecretChip
					key={index}
					triggerId={triggerId}
					disabled={disabled}
				/>
			);
	}
}

export const circlebackProvider: TriggerProvider<CirclebackConfig> = {
	kind: "circleback",
	label: "Circleback",
	icon: LuMic,
	menu: CIRCLEBACK_MENU,
	renderSentence: (config, ctx) => (
		<Sentence
			parts={CIRCLEBACK_SENTENCE}
			renderSlot={(slot, index) => renderSlot(config, slot, index, ctx)}
		/>
	),
};
