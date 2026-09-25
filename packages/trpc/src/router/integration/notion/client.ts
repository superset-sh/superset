import {
	type APIResponseError,
	Client,
	isHTTPResponseError,
	type PageObjectResponse,
	type RichTextItemResponse,
	type UnknownHTTPResponseError,
} from "@notionhq/client";

/** The API version the SDK speaks; the OAuth exchange must send the same one. */
export const NOTION_VERSION = Client.defaultNotionVersion;

/**
 * A client on one connection's token. No SDK retries: a stalled Notion
 * response must not hold a webhook delivery open, and the sender retries a
 * transient failure itself.
 */
export function notionClient(accessToken: string): Client {
	return new Client({ auth: accessToken, timeoutMs: 15_000, retry: false });
}

/** True when retrying will not help — the token, capability or entity is gone. */
export function isPermanentNotionError(
	error: unknown,
): error is APIResponseError | UnknownHTTPResponseError {
	return (
		isHTTPResponseError(error) && [400, 401, 403, 404].includes(error.status)
	);
}

export function plainText(
	richText: RichTextItemResponse[] | undefined,
): string {
	return (richText ?? []).map((t) => t.plain_text).join("");
}

/** The user ids a comment @-mentions. Page and date mentions do not count. */
export function mentionedUserIds(
	richText: RichTextItemResponse[] | undefined,
): string[] {
	const ids = new Set<string>();
	for (const item of richText ?? []) {
		if (item.type !== "mention" || item.mention.type !== "user") continue;
		ids.add(item.mention.user.id);
	}
	return [...ids];
}

export function pageTitle(page: PageObjectResponse): string | null {
	for (const property of Object.values(page.properties)) {
		if (property.type === "title") {
			const title = plainText(property.title);
			if (title) return title;
		}
	}
	return null;
}
