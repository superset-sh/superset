/**
 * Tickets: short signed statements from the API — "this page (or file) may
 * be read until `exp`" — verified by the content Worker with nothing but the
 * shared secret. They carry no identity; access was already decided by the
 * API when one was minted. HMAC-SHA256 over WebCrypto so the same code runs
 * in Node, Workers, and browsers. A `kind` claim keeps a page ticket from
 * ever opening a file and the other way round.
 */
export interface PageTicketClaims {
	pageId: string;
	/** When set, the ticket opens only this version. */
	version?: number;
	/** Expiry, in seconds since the epoch. */
	exp: number;
}

export interface FileTicketClaims {
	fileId: string;
	/**
	 * The server-sniffed content type, carried in the ticket so the media
	 * route can apply the serve-time policy without a database.
	 */
	contentType: string;
	/** Expiry, in seconds since the epoch. */
	exp: number;
}

const PAGE_KIND = "page";
const FILE_KIND = "file";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
	const padded =
		text.replace(/-/g, "+").replace(/_/g, "/") +
		"=".repeat((4 - (text.length % 4)) % 4);
	try {
		const binary = atob(padded);
		const out = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
		return out;
	} catch {
		return null;
	}
}

function hmacKey(secret: string) {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

async function signClaims(secret: string, wire: object): Promise<string> {
	const payload = toBase64Url(encoder.encode(JSON.stringify(wire)));
	const signature = await crypto.subtle.sign(
		"HMAC",
		await hmacKey(secret),
		encoder.encode(payload),
	);
	return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Returns the parsed wire claims when the signature checks out against any
 * secret in the list and the ticket has not expired; null otherwise.
 * `secrets` is the current secret first, then any previous one still in its
 * grace period, so rotation never invalidates tickets already handed out.
 */
async function verifyClaims(
	secrets: string | readonly string[],
	ticket: string,
	now: number,
): Promise<Record<string, unknown> | null> {
	const dot = ticket.indexOf(".");
	if (dot === -1) return null;
	const payload = ticket.slice(0, dot);
	const signature = fromBase64Url(ticket.slice(dot + 1));
	if (!signature) return null;

	let valid = false;
	for (const secret of typeof secrets === "string" ? [secrets] : secrets) {
		if (!secret) continue;
		valid = await crypto.subtle.verify(
			"HMAC",
			await hmacKey(secret),
			signature,
			encoder.encode(payload),
		);
		if (valid) break;
	}
	if (!valid) return null;

	const bytes = fromBase64Url(payload);
	if (!bytes) return null;
	let wire: unknown;
	try {
		wire = JSON.parse(decoder.decode(bytes));
	} catch {
		return null;
	}
	if (!wire || typeof wire !== "object") return null;
	const { exp } = wire as { exp?: unknown };
	if (typeof exp !== "number" || exp * 1000 <= now) return null;
	return wire as Record<string, unknown>;
}

export async function signPageTicket(
	secret: string,
	claims: PageTicketClaims,
): Promise<string> {
	return signClaims(secret, {
		kind: PAGE_KIND,
		pageId: claims.pageId,
		exp: claims.exp,
		...(claims.version !== undefined ? { version: claims.version } : {}),
	});
}

export async function verifyPageTicket(
	secrets: string | readonly string[],
	ticket: string,
	now: number = Date.now(),
): Promise<PageTicketClaims | null> {
	const wire = await verifyClaims(secrets, ticket, now);
	if (!wire) return null;
	const { kind, pageId, version, exp } = wire as {
		kind?: unknown;
		pageId?: unknown;
		version?: unknown;
		exp: number;
	};
	if (
		kind !== PAGE_KIND ||
		typeof pageId !== "string" ||
		(version !== undefined && !Number.isInteger(version))
	) {
		return null;
	}
	return {
		pageId,
		exp,
		...(version !== undefined ? { version: version as number } : {}),
	};
}

export async function signFileTicket(
	secret: string,
	claims: FileTicketClaims,
): Promise<string> {
	return signClaims(secret, {
		kind: FILE_KIND,
		fileId: claims.fileId,
		contentType: claims.contentType,
		exp: claims.exp,
	});
}

export async function verifyFileTicket(
	secrets: string | readonly string[],
	ticket: string,
	now: number = Date.now(),
): Promise<FileTicketClaims | null> {
	const wire = await verifyClaims(secrets, ticket, now);
	if (!wire) return null;
	const { kind, fileId, contentType, exp } = wire as {
		kind?: unknown;
		fileId?: unknown;
		contentType?: unknown;
		exp: number;
	};
	if (
		kind !== FILE_KIND ||
		typeof fileId !== "string" ||
		typeof contentType !== "string"
	) {
		return null;
	}
	return { fileId, contentType, exp };
}
