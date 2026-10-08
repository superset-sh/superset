import {
	pageGuestTicketPath,
	pageStorageSocketPath,
	pageStorageTicketPath,
} from "./page-storage-hub";

export async function pageStorageSocketUrl({
	pageId,
	realtimeUrl,
	token,
	watch = false,
}: {
	pageId: string;
	realtimeUrl: string;
	token: () => Promise<string | null>;
	watch?: boolean;
}): Promise<string | null> {
	const jwt = await token().catch(() => null);
	if (!jwt) return null;

	const path = pageStorageTicketPath(pageId);
	return socketUrl(pageId, realtimeUrl, watch ? `${path}?watch=1` : path, {
		method: "POST",
		headers: { authorization: `Bearer ${jwt}` },
	});
}

export async function pageGuestSocketUrl({
	pageId,
	realtimeUrl,
	guestId,
	watch = false,
}: {
	pageId: string;
	realtimeUrl: string;
	guestId: string;
	watch?: boolean;
}): Promise<string | null> {
	return socketUrl(pageId, realtimeUrl, pageGuestTicketPath(pageId), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ guestId, watch }),
	});
}

async function socketUrl(
	pageId: string,
	realtimeUrl: string,
	ticketPath: string,
	init: RequestInit,
): Promise<string | null> {
	let response: Response;
	try {
		response = await fetch(`${realtimeUrl}${ticketPath}`, init);
	} catch {
		return null;
	}
	if (!response.ok) return null;

	const body = (await response.json().catch(() => null)) as {
		ticket?: string;
	} | null;
	if (!body?.ticket) return null;

	return `${realtimeUrl.replace(/^http/, "ws")}${pageStorageSocketPath(
		pageId,
	)}?ticket=${encodeURIComponent(body.ticket)}`;
}
