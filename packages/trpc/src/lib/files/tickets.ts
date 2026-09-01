import type { SelectFile } from "@superset/db/schema";
import { signFileTicket } from "@superset/shared/usercontent";
import { env } from "../../env";

// Files are immutable by id, so their tickets turn daily like a pinned page
// version: `exp = ceil(now/w)*w + w` keeps URLs identical within the window
// (caches hit) and valid for at least one full day.
const FILE_TICKET_WINDOW_SECONDS = 24 * 60 * 60;

export function mediaBaseUrl(): string {
	return env.MEDIA_URL;
}

export async function mintFileTicket(
	file: Pick<SelectFile, "id" | "contentType">,
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const exp =
		Math.ceil(now / FILE_TICKET_WINDOW_SECONDS) * FILE_TICKET_WINDOW_SECONDS +
		FILE_TICKET_WINDOW_SECONDS;
	return signFileTicket(env.USERCONTENT_TOKEN_SECRET, {
		fileId: file.id,
		contentType: file.contentType,
		exp,
	});
}
