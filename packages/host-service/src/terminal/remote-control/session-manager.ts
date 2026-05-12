import crypto from "node:crypto";
import {
	REMOTE_CONTROL_DEFAULT_TTL_SEC,
	REMOTE_CONTROL_MAX_TTL_SEC,
	REMOTE_CONTROL_MAX_VIEWERS,
	REMOTE_CONTROL_MIN_TTL_SEC,
	REMOTE_CONTROL_PROTOCOL_VERSION,
	type RemoteControlMode,
	type RemoteControlRevokeReason,
	type RemoteControlTokenClaims,
} from "@superset/shared/remote-control-protocol";

interface ViewerSocket {
	close(reason?: RemoteControlRevokeReason): void;
}

interface ActiveSession {
	sessionId: string;
	terminalId: string;
	workspaceId: string;
	mode: RemoteControlMode;
	tokenHash: string;
	expiresAt: number; // unix seconds
	viewers: Set<ViewerSocket>;
	revokeListeners: Set<(reason: RemoteControlRevokeReason) => void>;
}

interface RemoteControlState {
	secret: Buffer | null;
	sessions: Map<string, ActiveSession>;
	expiryTimer: NodeJS.Timeout | null;
}

const state: RemoteControlState = {
	secret: null,
	sessions: new Map(),
	expiryTimer: null,
};

const SECRET_DERIVATION_LABEL = "superset.remote-control.v1";

export function initRemoteControlSecret(baseSecret: string): void {
	if (!baseSecret || baseSecret.length === 0) {
		throw new Error("initRemoteControlSecret: baseSecret must be non-empty");
	}
	const derived = crypto
		.createHash("sha256")
		.update(SECRET_DERIVATION_LABEL + baseSecret)
		.digest();
	if (state.secret) {
		if (state.secret.equals(derived)) return;
		throw new Error(
			"initRemoteControlSecret: already initialized with a different secret",
		);
	}
	state.secret = derived;
}

function requireSecret(): Buffer {
	if (!state.secret) {
		throw new Error(
			"remote-control secret is not initialized — call initRemoteControlSecret first",
		);
	}
	return state.secret;
}

function base64UrlEncode(buf: Buffer | string): string {
	const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
	return b
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function base64UrlDecode(s: string): Buffer {
	const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
	return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function nowSec(): number {
	return Math.floor(Date.now() / 1000);
}

export function hashRemoteControlToken(token: string): string {
	return crypto.createHash("sha256").update(token).digest("hex");
}

export interface MintRemoteControlTokenInput {
	sessionId: string;
	terminalId: string;
	workspaceId: string;
	mode: RemoteControlMode;
	createdByUserId: string;
	ttlSec?: number;
}

export interface MintRemoteControlTokenResult {
	token: string;
	tokenHash: string;
	expiresAt: number; // unix seconds
}

export function mintRemoteControlToken(
	input: MintRemoteControlTokenInput,
): MintRemoteControlTokenResult {
	const secret = requireSecret();
	const ttlRaw = input.ttlSec ?? REMOTE_CONTROL_DEFAULT_TTL_SEC;
	const ttl = Math.max(
		REMOTE_CONTROL_MIN_TTL_SEC,
		Math.min(REMOTE_CONTROL_MAX_TTL_SEC, Math.floor(ttlRaw)),
	);
	const iat = nowSec();
	const exp = iat + ttl;
	const claims: RemoteControlTokenClaims = {
		v: REMOTE_CONTROL_PROTOCOL_VERSION,
		sid: input.sessionId,
		tid: input.terminalId,
		wid: input.workspaceId,
		mode: input.mode,
		uid: input.createdByUserId,
		iat,
		exp,
	};
	const claimsB64 = base64UrlEncode(JSON.stringify(claims));
	const nonceB64 = base64UrlEncode(crypto.randomBytes(16));
	const sig = crypto
		.createHmac("sha256", secret)
		.update(`${claimsB64}.${nonceB64}`)
		.digest();
	const sigB64 = base64UrlEncode(sig);
	const token = `${claimsB64}.${sigB64}.${nonceB64}`;
	return {
		token,
		tokenHash: hashRemoteControlToken(token),
		expiresAt: exp,
	};
}

export type VerifyRemoteControlTokenResult =
	| { ok: true; claims: RemoteControlTokenClaims }
	| { ok: false; reason: "malformed" | "bad-signature" | "expired" };

export function verifyRemoteControlToken(
	token: string,
): VerifyRemoteControlTokenResult {
	const secret = requireSecret();
	const parts = token.split(".");
	if (parts.length !== 3) return { ok: false, reason: "malformed" };
	const [claimsB64, sigB64, nonceB64] = parts;
	if (!claimsB64 || !sigB64 || !nonceB64) {
		return { ok: false, reason: "malformed" };
	}
	let providedSig: Buffer;
	try {
		providedSig = base64UrlDecode(sigB64);
	} catch {
		return { ok: false, reason: "malformed" };
	}
	const expectedSig = crypto
		.createHmac("sha256", secret)
		.update(`${claimsB64}.${nonceB64}`)
		.digest();
	if (
		providedSig.length !== expectedSig.length ||
		!crypto.timingSafeEqual(providedSig, expectedSig)
	) {
		return { ok: false, reason: "bad-signature" };
	}
	let claims: RemoteControlTokenClaims;
	try {
		const json = base64UrlDecode(claimsB64).toString("utf8");
		claims = JSON.parse(json) as RemoteControlTokenClaims;
	} catch {
		return { ok: false, reason: "malformed" };
	}
	if (claims.v !== REMOTE_CONTROL_PROTOCOL_VERSION) {
		return { ok: false, reason: "malformed" };
	}
	if (
		typeof claims.exp !== "number" ||
		typeof claims.iat !== "number" ||
		typeof claims.sid !== "string" ||
		typeof claims.tid !== "string" ||
		typeof claims.wid !== "string" ||
		typeof claims.uid !== "string" ||
		(claims.mode !== "command" && claims.mode !== "full")
	) {
		return { ok: false, reason: "malformed" };
	}
	if (claims.exp <= nowSec()) {
		return { ok: false, reason: "expired" };
	}
	return { ok: true, claims };
}

export interface RegisterRemoteControlSessionInput {
	sessionId: string;
	terminalId: string;
	workspaceId: string;
	mode: RemoteControlMode;
	tokenHash: string;
	expiresAt: number;
}

export function registerRemoteControlSession(
	input: RegisterRemoteControlSessionInput,
): ActiveSession {
	const existing = state.sessions.get(input.sessionId);
	if (existing && existing.tokenHash !== input.tokenHash) {
		revokeSession(input.sessionId, "manual");
	}
	const reused = state.sessions.get(input.sessionId);
	if (reused) {
		reused.tokenHash = input.tokenHash;
		reused.expiresAt = input.expiresAt;
		reused.terminalId = input.terminalId;
		reused.workspaceId = input.workspaceId;
		reused.mode = input.mode;
		return reused;
	}
	const session: ActiveSession = {
		sessionId: input.sessionId,
		terminalId: input.terminalId,
		workspaceId: input.workspaceId,
		mode: input.mode,
		tokenHash: input.tokenHash,
		expiresAt: input.expiresAt,
		viewers: new Set(),
		revokeListeners: new Set(),
	};
	state.sessions.set(input.sessionId, session);
	return session;
}

export interface AuthenticateSessionResult {
	ok: true;
	mode: RemoteControlMode;
	terminalId: string;
	workspaceId: string;
	expiresAt: number;
	createdByUserId: string;
}

export type AuthenticateSessionFailure = {
	ok: false;
	reason:
		| "invalid-token"
		| "session-not-found"
		| "session-expired"
		| "session-mismatch";
};

export function authenticateSession(
	sessionId: string,
	token: string,
): AuthenticateSessionResult | AuthenticateSessionFailure {
	const verified = verifyRemoteControlToken(token);
	if (!verified.ok) {
		return {
			ok: false,
			reason:
				verified.reason === "expired" ? "session-expired" : "invalid-token",
		};
	}
	if (verified.claims.sid !== sessionId) {
		return { ok: false, reason: "session-mismatch" };
	}
	const session = state.sessions.get(sessionId);
	if (!session) return { ok: false, reason: "session-not-found" };
	const providedHash = Buffer.from(hashRemoteControlToken(token), "hex");
	const expectedHash = Buffer.from(session.tokenHash, "hex");
	if (
		providedHash.length !== expectedHash.length ||
		!crypto.timingSafeEqual(providedHash, expectedHash)
	) {
		return { ok: false, reason: "invalid-token" };
	}
	if (session.expiresAt <= nowSec()) {
		revokeSession(sessionId, "expired");
		return { ok: false, reason: "session-expired" };
	}
	return {
		ok: true,
		mode: session.mode,
		terminalId: session.terminalId,
		workspaceId: session.workspaceId,
		expiresAt: session.expiresAt,
		createdByUserId: verified.claims.uid,
	};
}

export type AddViewerResult =
	| { ok: true }
	| { ok: false; reason: "max-viewers" | "session-not-found" };

export function addViewer(
	sessionId: string,
	viewer: ViewerSocket,
): AddViewerResult {
	const session = state.sessions.get(sessionId);
	if (!session) return { ok: false, reason: "session-not-found" };
	if (session.viewers.size >= REMOTE_CONTROL_MAX_VIEWERS) {
		return { ok: false, reason: "max-viewers" };
	}
	session.viewers.add(viewer);
	return { ok: true };
}

export function removeViewer(sessionId: string, viewer: ViewerSocket): void {
	const session = state.sessions.get(sessionId);
	if (!session) return;
	session.viewers.delete(viewer);
}

export function viewerCount(sessionId: string): number {
	return state.sessions.get(sessionId)?.viewers.size ?? 0;
}

export function listViewers(sessionId: string): ViewerSocket[] {
	const session = state.sessions.get(sessionId);
	return session ? Array.from(session.viewers) : [];
}

export function onRevoke(
	sessionId: string,
	listener: (reason: RemoteControlRevokeReason) => void,
): () => void {
	const session = state.sessions.get(sessionId);
	if (!session) {
		// Session already gone — fire synchronously so caller can clean up.
		queueMicrotask(() => listener("manual"));
		return () => {};
	}
	session.revokeListeners.add(listener);
	return () => {
		session.revokeListeners.delete(listener);
	};
}

export function revokeSession(
	sessionId: string,
	reason: RemoteControlRevokeReason,
): void {
	const session = state.sessions.get(sessionId);
	if (!session) return;
	state.sessions.delete(sessionId);
	for (const listener of Array.from(session.revokeListeners)) {
		try {
			listener(reason);
		} catch (err) {
			console.warn("[remote-control] revoke listener threw:", err);
		}
	}
	session.revokeListeners.clear();
	for (const viewer of Array.from(session.viewers)) {
		try {
			viewer.close(reason);
		} catch (err) {
			console.warn("[remote-control] viewer close threw:", err);
		}
	}
	session.viewers.clear();
}

export function revokeSessionsForTerminal(terminalId: string): void {
	const ids: string[] = [];
	for (const [id, s] of state.sessions) {
		if (s.terminalId === terminalId) ids.push(id);
	}
	for (const id of ids) revokeSession(id, "terminal");
}

export function revokeAllSessions(reason: RemoteControlRevokeReason): void {
	for (const id of Array.from(state.sessions.keys())) {
		revokeSession(id, reason);
	}
}

export function listActiveSessions(): Array<{
	sessionId: string;
	terminalId: string;
	workspaceId: string;
	mode: RemoteControlMode;
	viewerCount: number;
	expiresAt: number;
}> {
	return Array.from(state.sessions.values()).map((s) => ({
		sessionId: s.sessionId,
		terminalId: s.terminalId,
		workspaceId: s.workspaceId,
		mode: s.mode,
		viewerCount: s.viewers.size,
		expiresAt: s.expiresAt,
	}));
}

export function getActiveSessionMode(
	sessionId: string,
): RemoteControlMode | null {
	return state.sessions.get(sessionId)?.mode ?? null;
}

export function startRemoteControlExpirySweep(intervalMs = 60_000): void {
	if (state.expiryTimer) return;
	const timer = setInterval(() => {
		const now = nowSec();
		const expired: string[] = [];
		for (const [id, s] of state.sessions) {
			if (s.expiresAt <= now) expired.push(id);
		}
		if (expired.length > 0) {
			console.log(
				`[remote-control] expiring ${expired.length} session(s) via sweep`,
			);
			for (const id of expired) revokeSession(id, "expired");
		}
	}, intervalMs);
	timer.unref?.();
	state.expiryTimer = timer;
}

export function stopRemoteControlExpirySweep(): void {
	if (!state.expiryTimer) return;
	clearInterval(state.expiryTimer);
	state.expiryTimer = null;
}

export function __resetRemoteControlForTesting(): void {
	stopRemoteControlExpirySweep();
	revokeAllSessions("manual");
	state.secret = null;
	state.sessions.clear();
}
