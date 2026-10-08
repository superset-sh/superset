import {
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

	let response: Response;
	try {
		response = await fetch(`${realtimeUrl}${pageStorageTicketPath(pageId)}`, {
			method: "POST",
			headers: { authorization: `Bearer ${jwt}` },
		});
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
