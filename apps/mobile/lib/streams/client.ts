/**
 * Streams API Client
 *
 * Client for interacting with the session registry API on the streams server.
 */

import { env } from "../env";

/**
 * Generate a UUID using crypto.getRandomValues (polyfilled by react-native-get-random-values)
 */
export function generateUUID(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
	bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
		"",
	);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface SessionInfo {
	sessionId: string;
	title: string;
	createdAt: string;
	createdBy?: string;
}

function getStreamsUrl(): string {
	const url = env.EXPO_PUBLIC_STREAMS_URL;
	if (!url) {
		throw new Error("EXPO_PUBLIC_STREAMS_URL is not configured");
	}
	return url;
}

export async function listSessions(): Promise<SessionInfo[]> {
	const url = getStreamsUrl();
	const res = await fetch(`${url}/sessions`);

	if (!res.ok) {
		throw new Error(`Failed to list sessions: ${res.status} ${res.statusText}`);
	}

	return res.json();
}

export async function getSession(
	sessionId: string,
): Promise<SessionInfo | null> {
	const url = getStreamsUrl();
	const res = await fetch(`${url}/sessions/${sessionId}`);

	if (res.status === 404) {
		return null;
	}

	if (!res.ok) {
		throw new Error(`Failed to get session: ${res.status} ${res.statusText}`);
	}

	return res.json();
}

export async function createSession({
	title,
	createdBy,
}: {
	title: string;
	createdBy?: string;
}): Promise<SessionInfo> {
	const url = getStreamsUrl();
	const sessionId = generateUUID();

	const res = await fetch(`${url}/sessions`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ sessionId, title, createdBy }),
	});

	if (!res.ok) {
		throw new Error(
			`Failed to create session: ${res.status} ${res.statusText}`,
		);
	}

	return res.json();
}

export async function getOrCreateSession({
	sessionId,
	title,
	createdBy,
}: {
	sessionId: string;
	title: string;
	createdBy?: string;
}): Promise<SessionInfo> {
	const existing = await getSession(sessionId);
	if (existing) {
		return existing;
	}

	const url = getStreamsUrl();
	const res = await fetch(`${url}/sessions`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ sessionId, title, createdBy }),
	});

	if (!res.ok) {
		throw new Error(
			`Failed to create session: ${res.status} ${res.statusText}`,
		);
	}

	return res.json();
}
