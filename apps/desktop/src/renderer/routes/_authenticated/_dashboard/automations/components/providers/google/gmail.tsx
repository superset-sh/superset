import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { isEmptyScope } from "@superset/shared/automation-triggers";
import { SiGmail } from "react-icons/si";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { SelectChip } from "../../TriggerSentence/components/SelectChip";
import { TextFilterChip } from "../../TriggerSentence/components/TextFilterChip";
import { Sentence } from "../components/Sentence";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	ATTACHMENT_OPTIONS,
	GMAIL_MENU,
	GMAIL_SENTENCE,
	type GmailConfig,
	type GmailSlot,
} from "./grammar";

function renderSlot(
	config: GmailConfig,
	slot: GmailSlot,
	index: number,
	{ set, mark, options, state, disabled }: SentenceContext,
) {
	switch (slot) {
		case "from":
			return (
				<ScopeChip
					key={index}
					scope={config.from}
					onChange={(v) => set({ from: v })}
					className={mark("from")}
					options={[]}
					emptyLabel={i18n._(
						msg({
							message: "Select senders",
						}),
					)}
					anyLabel={i18n._(
						msg({
							message: "Any sender",
						}),
					)}
					allowCustom={{
						placeholder: i18n._(
							msg({
								message: "Add address or domain…",
							}),
						),
					}}
					disabled={disabled}
				/>
			);
		case "to":
			return (
				<ScopeChip
					key={index}
					scope={config.to}
					// Clearing an optional filter means "any", not "none".
					onChange={(v) => set({ to: isEmptyScope(v) ? { mode: "any" } : v })}
					options={[]}
					emptyLabel={i18n._(
						msg({
							message: "Any recipient",
						}),
					)}
					anyLabel={i18n._(
						msg({
							message: "Any recipient",
						}),
					)}
					allowCustom={{
						placeholder: i18n._(
							msg({
								message: "Add address or domain…",
							}),
						),
					}}
					disabled={disabled}
				/>
			);
		case "subjectFilter":
			return (
				<TextFilterChip
					key={index}
					value={config.subjectFilter}
					onChange={(v) => set({ subjectFilter: v })}
					emptyLabel={i18n._(
						msg({
							message: "anything",
						}),
					)}
					placeholder={i18n._(
						msg({
							message: "Subject contains...",
						}),
					)}
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
					options={options.google?.labels ?? []}
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
		case "hasAttachment":
			return (
				<SelectChip
					key={index}
					value={config.hasAttachment ? "attachment" : "any"}
					onChange={(v) => set({ hasAttachment: v === "attachment" })}
					options={ATTACHMENT_OPTIONS.map((option) => ({
						value: option.value,
						label: i18n._(option.label),
					}))}
					disabled={disabled}
				/>
			);
	}
}

export const gmailProvider: TriggerProvider<GmailConfig> = {
	kind: "gmail",
	optionGroup: "google",
	label: "Gmail",
	icon: SiGmail,
	menu: GMAIL_MENU,
	renderSentence: (config, ctx) => (
		<Sentence
			parts={GMAIL_SENTENCE}
			renderSlot={(slot, index) => renderSlot(config, slot, index, ctx)}
		/>
	),
};
