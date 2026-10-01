import { fileUrl, signFileTicket } from "@superset/shared/usercontent";
import { env } from "../../env";

/**
 * Expiry rounds to a window boundary the way page tickets do
 * (`page/storage.ts`): identical claims within the window give an identical
 * URL, so re-fetching a list does not churn every image element on the
 * page. A ticket lives at least one full window and at most two.
 */
const FILE_TICKET_WINDOW_SECONDS = 60 * 60;

/**
 * A served URL for a file the caller was already authorized to read — the
 * authorization happened in whichever router loaded the file's parent, and
 * the ticket only carries that decision to the media host. `contentType`
 * must be the server-sniffed type of a `ready` row: the Worker applies its
 * serve-time policy from the ticket without a database.
 */
export async function mintFileUrl(file: {
	id: string;
	name: string;
	contentType: string;
}): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const exp =
		Math.ceil(now / FILE_TICKET_WINDOW_SECONDS) * FILE_TICKET_WINDOW_SECONDS +
		FILE_TICKET_WINDOW_SECONDS;
	const ticket = await signFileTicket(env.USERCONTENT_TOKEN_SECRET, {
		fileId: file.id,
		contentType: file.contentType,
		exp,
	});
	return fileUrl({
		baseUrl: env.MEDIA_URL,
		fileId: file.id,
		filename: file.name,
		ticket,
	});
}
