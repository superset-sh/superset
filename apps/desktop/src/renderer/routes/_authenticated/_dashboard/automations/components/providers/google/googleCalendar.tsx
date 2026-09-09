import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { SiGooglecalendar } from "react-icons/si";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { SelectChip } from "../../TriggerSentence/components/SelectChip";
import { TextFilterChip } from "../../TriggerSentence/components/TextFilterChip";
import { Sentence } from "../components/Sentence";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	CALENDAR_MENU,
	CALENDAR_SENTENCES,
	type CalendarSlot,
	EXTERNAL_ATTENDEE_OPTIONS,
	type GoogleCalendarConfig,
	MINUTES_BEFORE_OPTIONS,
} from "./grammar";

function renderSlot(
	config: GoogleCalendarConfig,
	slot: CalendarSlot,
	index: number,
	{ set, mark, options, state, disabled }: SentenceContext,
) {
	// The slot list is derived from this event, so the fields it names are
	// present on this config member even where the union type cannot say so.
	const c = config as unknown as Record<string, never>;
	switch (slot) {
		case "calendars":
			return (
				<ScopeChip
					key={index}
					scope={c.calendars}
					onChange={(v) => set({ calendars: v })}
					className={mark("calendars")}
					options={options.google?.calendars ?? []}
					emptyLabel={i18n._(
						msg({
							message: "Select calendars",
						}),
					)}
					anyLabel={i18n._(
						msg({
							message: "Any calendar",
						}),
					)}
					state={state}
					disabled={disabled}
				/>
			);
		case "attendee":
			return (
				<ScopeChip
					key={index}
					scope={c.attendee}
					onChange={(v) => set({ attendee: v })}
					className={mark("attendee")}
					options={options.google?.people ?? []}
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
					allowCustom={{
						placeholder: i18n._(
							msg({
								message: "Type an email, press Enter",
							}),
						),
					}}
					state={state}
					disabled={disabled}
				/>
			);
		case "titleFilter":
			return (
				<TextFilterChip
					key={index}
					value={c.titleFilter}
					onChange={(v) => set({ titleFilter: v })}
					emptyLabel={i18n._(
						msg({
							message: "anything",
						}),
					)}
					placeholder={i18n._(
						msg({
							message: "Title contains...",
						}),
					)}
					disabled={disabled}
				/>
			);
		case "hasExternalAttendee":
			return (
				<SelectChip
					key={index}
					value={c.hasExternalAttendee ? "external" : "any"}
					onChange={(v) => set({ hasExternalAttendee: v === "external" })}
					options={EXTERNAL_ATTENDEE_OPTIONS.map((option) => ({
						value: option.value,
						label: i18n._(option.label),
					}))}
					disabled={disabled}
				/>
			);
		case "minutesBefore":
			return (
				<SelectChip
					key={index}
					value={String(c.minutesBefore)}
					onChange={(v) => set({ minutesBefore: Number(v) })}
					options={MINUTES_BEFORE_OPTIONS.map((option) => ({
						value: option.value,
						label: i18n._(option.label),
					}))}
					disabled={disabled}
				/>
			);
	}
}

export const googleCalendarProvider: TriggerProvider<GoogleCalendarConfig> = {
	kind: "google_calendar",
	optionGroup: "google",
	label: "Google Calendar",
	icon: SiGooglecalendar,
	menu: CALENDAR_MENU,
	renderSentence: (config, ctx) => (
		<Sentence
			parts={CALENDAR_SENTENCES[config.event]}
			fallback={config.event}
			renderSlot={(slot, index) => renderSlot(config, slot, index, ctx)}
		/>
	),
};
