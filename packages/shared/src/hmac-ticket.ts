/**
 * A signed statement from the API that another service verifies with nothing
 * but the shared secret: `<base64url claims>.<base64url HMAC-SHA256>`.
 * WebCrypto only, so the same code runs in Node, Workers and browsers.
 */
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

export async function hmacBase64Url(
	secret: string,
	message: string,
): Promise<string> {
	const signature = await crypto.subtle.sign(
		"HMAC",
		await hmacKey(secret),
		encoder.encode(message),
	);
	return toBase64Url(new Uint8Array(signature));
}

export async function signTicket(
	secret: string,
	claims: object,
): Promise<string> {
	const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
	return `${payload}.${await hmacBase64Url(secret, payload)}`;
}

/** The claims when the signature checks out; null for anything else. */
export async function verifyTicket(
	secret: string,
	ticket: string,
): Promise<unknown> {
	const [payload, signature, extra] = ticket.split(".");
	if (!payload || !signature || extra !== undefined) return null;
	const signatureBytes = fromBase64Url(signature);
	const payloadBytes = fromBase64Url(payload);
	if (!signatureBytes || !payloadBytes) return null;
	const valid = await crypto.subtle.verify(
		"HMAC",
		await hmacKey(secret),
		signatureBytes,
		encoder.encode(payload),
	);
	if (!valid) return null;
	try {
		return JSON.parse(decoder.decode(payloadBytes));
	} catch {
		return null;
	}
}
