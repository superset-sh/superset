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
	{ set, mark, options, disabled }: SentenceContext,
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
					emptyLabel="Select calendars"
					anyLabel="Any calendar"
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
					emptyLabel="Select people"
					anyLabel="Anyone"
					allowCustom={{ placeholder: "Type an email, press Enter" }}
					disabled={disabled}
				/>
			);
		case "titleFilter":
			return (
				<TextFilterChip
					key={index}
					value={c.titleFilter}
					onChange={(v) => set({ titleFilter: v })}
					emptyLabel="anything"
					placeholder="Title contains..."
					disabled={disabled}
				/>
			);
		case "hasExternalAttendee":
			return (
				<SelectChip
					key={index}
					value={c.hasExternalAttendee ? "external" : "any"}
					onChange={(v) => set({ hasExternalAttendee: v === "external" })}
					options={EXTERNAL_ATTENDEE_OPTIONS}
					disabled={disabled}
				/>
			);
		case "minutesBefore":
			return (
				<SelectChip
					key={index}
					value={String(c.minutesBefore)}
					onChange={(v) => set({ minutesBefore: Number(v) })}
					options={MINUTES_BEFORE_OPTIONS}
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
