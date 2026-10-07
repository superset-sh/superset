import { calendar, text } from "../api";
import type { Handler } from "../types";

interface CalendarListEntry {
	id?: string;
	summary?: string;
	summaryOverride?: string;
	primary?: boolean;
	accessRole?: string;
	timeZone?: string;
}

export const calendarHandlers: Record<string, Handler> = {
	list_calendars: async (_args, accessToken) => {
		const calendars: CalendarListEntry[] = [];
		let pageToken: string | undefined;
		do {
			const page = await calendar<{
				items?: CalendarListEntry[];
				nextPageToken?: string;
			}>(accessToken, ["users", "me", "calendarList"], {
				query: { pageToken, maxResults: 250 },
			});
			calendars.push(...(page.items ?? []));
			pageToken = page.nextPageToken;
		} while (pageToken);
		if (!calendars.length) return text("No calendars found");
		const lines = [`${calendars.length} calendar(s)`];
		for (const entry of calendars) {
			const name = entry.summaryOverride ?? entry.summary ?? "(untitled)";
			const primary = entry.primary ? " (primary)" : "";
			lines.push(
				`[${entry.id}] ${name}${primary} — ${entry.accessRole}, ${entry.timeZone}`,
			);
		}
		return text(lines.join("\n"));
	},
};
