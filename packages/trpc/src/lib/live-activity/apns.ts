import { createPrivateKey, sign } from "node:crypto";
import http2 from "node:http2";
import { env } from "../../env";
import type { CardContentState } from "./card";

export type LiveActivityPushEvent = "start" | "update" | "end";

export interface LiveActivityPush {
	token: string;
	event: LiveActivityPushEvent;
	contentState: CardContentState;
	/** 10 reaches the device now and spends Apple's per-device budget; 5 may wait. */
	priority: 5 | 10;
	/** `start` only: the ActivityAttributes type name and its fields. */
	attributes?: { type: string; value: Record<string, unknown> };
}

export type LiveActivityPushResult =
	| { outcome: "sent" }
	| { outcome: "dead-token" }
	| { outcome: "unconfigured" }
	| { outcome: "rejected"; status: number; reason: string };

interface ApnsCredentials {
	keyId: string;
	teamId: string;
	privateKeyPem: string;
}

const JWT_TTL_MS = 50 * 60_000;
const REQUEST_TIMEOUT_MS = 5_000;

let cachedJwt: { value: string; issuedAt: number } | null = null;

function credentials(): ApnsCredentials | null {
	const { APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY } = env;
	if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) return null;
	return {
		keyId: APNS_KEY_ID,
		teamId: APNS_TEAM_ID,
		privateKeyPem: APNS_PRIVATE_KEY.replace(/\\n/g, "\n"),
	};
}

function base64url(input: string | Buffer): string {
	return Buffer.from(input).toString("base64url");
}

/** Apple accepts a provider token for an hour; ES256 over `header.claims`. */
function providerJwt(creds: ApnsCredentials): string {
	const now = Date.now();
	if (cachedJwt && now - cachedJwt.issuedAt < JWT_TTL_MS)
		return cachedJwt.value;
	const header = base64url(JSON.stringify({ alg: "ES256", kid: creds.keyId }));
	const claims = base64url(
		JSON.stringify({ iss: creds.teamId, iat: Math.floor(now / 1000) }),
	);
	const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
		key: createPrivateKey(creds.privateKeyPem),
		dsaEncoding: "ieee-p1363",
	});
	const value = `${header}.${claims}.${base64url(signature)}`;
	cachedJwt = { value, issuedAt: now };
	return value;
}

function payload(push: LiveActivityPush): string {
	const aps: Record<string, unknown> = {
		timestamp: Math.floor(Date.now() / 1000),
		event: push.event,
		"content-state": push.contentState,
	};
	if (push.event === "start" && push.attributes) {
		aps["attributes-type"] = push.attributes.type;
		aps.attributes = push.attributes.value;
	}
	if (push.event === "end") {
		aps["dismissal-date"] = Math.floor(Date.now() / 1000);
	}
	return JSON.stringify({ aps });
}

interface ApnsResponse {
	status: number;
	reason: string;
}

function post(push: LiveActivityPush, jwt: string): Promise<ApnsResponse> {
	return new Promise((resolve, reject) => {
		const client = http2.connect(`https://${env.APNS_HOST}`);
		const finish = (fn: () => void) => {
			client.close();
			fn();
		};
		client.on("error", (error) => finish(() => reject(error)));
		const request = client.request({
			":method": "POST",
			":path": `/3/device/${push.token}`,
			"apns-topic": `${env.APNS_BUNDLE_ID}.push-type.liveactivity`,
			"apns-push-type": "liveactivity",
			"apns-priority": String(push.priority),
			authorization: `bearer ${jwt}`,
			"content-type": "application/json",
		});
		request.setTimeout(REQUEST_TIMEOUT_MS, () => {
			request.close(http2.constants.NGHTTP2_CANCEL);
			finish(() => reject(new Error("APNs request timed out")));
		});
		let status = 0;
		const chunks: Buffer[] = [];
		request.on("response", (headers) => {
			status = Number(headers[":status"] ?? 0);
		});
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", () => {
			let reason = "";
			try {
				const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
					reason?: string;
				};
				reason = body.reason ?? "";
			} catch {
				// A 200 has no body.
			}
			finish(() => resolve({ status, reason }));
		});
		request.on("error", (error) => finish(() => reject(error)));
		request.end(payload(push));
	});
}

/**
 * One Live Activity push. Apple wants a persistent HTTP/2 connection, which
 * a serverless function cannot keep, so every send opens and closes one;
 * at our volume Apple tolerates that. Unconfigured credentials mean the
 * card stays foreground-only, which is the behaviour before pushes existed.
 */
export async function sendLiveActivityPush(
	push: LiveActivityPush,
): Promise<LiveActivityPushResult> {
	const creds = credentials();
	if (!creds) return { outcome: "unconfigured" };
	const response = await post(push, providerJwt(creds));
	if (response.status === 200) return { outcome: "sent" };
	if (
		response.status === 410 ||
		response.reason === "BadDeviceToken" ||
		response.reason === "Unregistered"
	) {
		return { outcome: "dead-token" };
	}
	if (response.status === 403 && response.reason === "ExpiredProviderToken") {
		cachedJwt = null;
	}
	return {
		outcome: "rejected",
		status: response.status,
		reason: response.reason,
	};
}
