import {
	calendar,
	freeSlots,
	instant,
	requireString,
	stringList,
	text,
} from "../api";
import type { Handler } from "../types";

interface FreeBusyResponse {
	calendars?: Record<
		string,
		{
			busy?: { start: string; end: string }[];
			errors?: { reason?: string }[];
		}
	>;
}

export const availabilityHandlers: Record<string, Handler> = {
	find_free_time: async (args, accessToken) => {
		const timeMin = instant(requireString(args, "timeMin"), "timeMin");
		const timeMax = instant(requireString(args, "timeMax"), "timeMax");
		const ids = stringList(args.calendarIds, "calendarIds");
		const calendarIds = ids.length ? ids : ["primary"];
		if (calendarIds.length > 50) {
			throw new Error("Google checks at most 50 calendars per call");
		}
		const minutes = Number(args.durationMinutes ?? 30);
		if (!Number.isFinite(minutes) || minutes <= 0) {
			throw new Error("durationMinutes must be a positive number");
		}

		const data = await calendar<FreeBusyResponse>(accessToken, ["freeBusy"], {
			method: "POST",
			body: {
				timeMin,
				timeMax,
				items: calendarIds.map((id) => ({ id })),
			},
		});

		const lines: string[] = [];
		const busy: { start: number; end: number }[] = [];
		for (const id of calendarIds) {
			const entry = data.calendars?.[id];
			if (!entry || entry.errors?.length) {
				const reason =
					entry?.errors?.[0]?.reason ?? "missing from Google's reply";
				lines.push(`${id}: not readable (${reason}); its busy time is unknown`);
				continue;
			}
			const blocks = entry.busy ?? [];
			lines.push(`${id}: ${blocks.length} busy block(s)`);
			for (const block of blocks) {
				lines.push(`  busy ${block.start} → ${block.end}`);
				busy.push({
					start: Date.parse(block.start),
					end: Date.parse(block.end),
				});
			}
		}

		const slots = freeSlots(
			busy,
			{ start: Date.parse(timeMin), end: Date.parse(timeMax) },
			minutes * 60_000,
		);
		lines.push(
			"",
			slots.length
				? `${slots.length} free window(s) of at least ${minutes} min for everyone readable (UTC):`
				: `No free window of ${minutes} min for everyone readable in this range.`,
		);
		for (const slot of slots) {
			lines.push(
				`  ${new Date(slot.start).toISOString()} → ${new Date(slot.end).toISOString()}`,
			);
		}
		return text(lines.join("\n"));
	},
};
