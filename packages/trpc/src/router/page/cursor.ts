/**
 * The list cursor is opaque to every caller: the CLI passes it back as a
 * string, and the MCP tool schema describes it as one. Keeping the keyset
 * columns out of the public shape is what lets the ordering change without
 * breaking a client, which the move from `updated_at` to `created_at` needed.
 */
export interface PageListKeyset {
	createdAt: string;
	id: string;
}

const POSTGRES_TIMESTAMPTZ_TEXT =
	/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2}(:\d{2})?)?$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodePageCursor(keyset: PageListKeyset): string {
	return Buffer.from(
		JSON.stringify({ createdAt: keyset.createdAt, id: keyset.id }),
	).toString("base64url");
}

export function decodePageCursor(value: string): PageListKeyset | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
	} catch {
		return null;
	}

	const keyset = parsed as Partial<PageListKeyset> | null;
	if (typeof keyset?.createdAt !== "string" || typeof keyset.id !== "string") {
		return null;
	}
	// `createdAt` is interpolated into the query as `::timestamptz`, so it is
	// checked here rather than trusted from whatever the caller echoed back.
	if (!POSTGRES_TIMESTAMPTZ_TEXT.test(keyset.createdAt)) return null;
	if (!UUID.test(keyset.id)) return null;

	return { createdAt: keyset.createdAt, id: keyset.id };
}
