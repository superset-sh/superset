import {
	pageGuestTicketPath,
	pageStorageSocketPath,
	pageStorageTicketPath,
} from "./page-storage-hub";

export async function pageStorageSocketUrl({
	pageId,
	realtimeUrl,
	token,
}: {
	pageId: string;
	realtimeUrl: string;
	token: () => Promise<string | null>;
}): Promise<string | null> {
	const jwt = await token().catch(() => null);
	if (!jwt) return null;

	return socketUrl(pageId, realtimeUrl, pageStorageTicketPath(pageId), {
		method: "POST",
		headers: { authorization: `Bearer ${jwt}` },
	});
}

export async function pageGuestSocketUrl({
	pageId,
	realtimeUrl,
	guestId,
}: {
	pageId: string;
	realtimeUrl: string;
	guestId: string;
}): Promise<string | null> {
	return socketUrl(pageId, realtimeUrl, pageGuestTicketPath(pageId), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ guestId }),
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
