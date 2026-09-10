/**
 * The token a client presents to a cloud workspace's host-service.
 *
 * A sandbox's exposed port is a public URL with nothing in front of it, so
 * host-service is the only gate. The API signs a short-lived token bound to
 * one workspace with an Ed25519 key it alone holds; the sandbox carries just
 * the public half, so nothing inside it — including an agent that can read
 * its own environment — can mint access to itself or to any other sandbox.
 *
 * Format: `v1.<base64url payload>.<base64url signature>`, payload
 * `{ aud, iat, exp }` with seconds since the epoch. Keys travel as base64url
 * DER (PKCS#8 private, SPKI public): one line, safe in every env mechanism.
 */
import {
	createPrivateKey,
	createPublicKey,
	generateKeyPairSync,
	type KeyObject,
	sign,
	verify,
} from "node:crypto";

const VERSION = "v1";

interface Payload {
	aud: string;
	iat: number;
	exp: number;
}

export interface SandboxAccessKeyPair {
	privateKey: string;
	publicKey: string;
}

export function generateSandboxAccessKeyPair(): SandboxAccessKeyPair {
	const { privateKey, publicKey } = generateKeyPairSync("ed25519");
	return {
		privateKey: privateKey
			.export({ format: "der", type: "pkcs8" })
			.toString("base64url"),
		publicKey: publicKey
			.export({ format: "der", type: "spki" })
			.toString("base64url"),
	};
}

function privateKeyObject(encoded: string): KeyObject {
	return createPrivateKey({
		key: Buffer.from(encoded, "base64url"),
		format: "der",
		type: "pkcs8",
	});
}

function publicKeyObject(encoded: string): KeyObject {
	return createPublicKey({
		key: Buffer.from(encoded, "base64url"),
		format: "der",
		type: "spki",
	});
}

/** The verifier a sandbox is handed; derived so the API holds one secret. */
export function sandboxAccessPublicKey(privateKey: string): string {
	return createPublicKey(privateKeyObject(privateKey))
		.export({ format: "der", type: "spki" })
		.toString("base64url");
}

export function signSandboxAccessToken(args: {
	privateKey: string;
	/** The cloud workspace id the token opens. */
	audience: string;
	ttlMs: number;
	now?: number;
}): { token: string; expiresAt: Date } {
	const now = args.now ?? Date.now();
	const payload: Payload = {
		aud: args.audience,
		iat: Math.floor(now / 1000),
		exp: Math.ceil((now + args.ttlMs) / 1000),
	};
	const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = sign(
		null,
		Buffer.from(`${VERSION}.${body}`),
		privateKeyObject(args.privateKey),
	).toString("base64url");
	return {
		token: `${VERSION}.${body}.${signature}`,
		expiresAt: new Date(payload.exp * 1000),
	};
}

/**
 * True only for a token this key signed, for this audience, that has not
 * expired. Every failure is a plain false: the caller answers 401 either way,
 * and a reason string would only tell a probe which check it got past.
 */
export function verifySandboxAccessToken(args: {
	publicKey: string;
	token: string;
	audience: string;
	now?: number;
}): boolean {
	const [version, body, signature] = args.token.split(".");
	if (version !== VERSION || !body || !signature) return false;
	let payload: Payload;
	try {
		if (
			!verify(
				null,
				Buffer.from(`${VERSION}.${body}`),
				publicKeyObject(args.publicKey),
				Buffer.from(signature, "base64url"),
			)
		) {
			return false;
		}
		payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
	} catch {
		return false;
	}
	if (payload.aud !== args.audience) return false;
	const nowSeconds = (args.now ?? Date.now()) / 1000;
	return typeof payload.exp === "number" && payload.exp > nowSeconds;
}
