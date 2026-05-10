import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	__resetRemoteControlForTesting,
	addViewer,
	authenticateSession,
	getActiveSessionMode,
	hashRemoteControlToken,
	initRemoteControlSecret,
	listActiveSessions,
	mintRemoteControlToken,
	onRevoke,
	registerRemoteControlSession,
	revokeSession,
	revokeSessionsForTerminal,
	startRemoteControlExpirySweep,
	stopRemoteControlExpirySweep,
	verifyRemoteControlToken,
	viewerCount,
} from "./session-manager";

interface FakeViewer {
	closed: boolean;
	close(): void;
}

function fakeViewer(): FakeViewer {
	const v: FakeViewer = {
		closed: false,
		close() {
			v.closed = true;
		},
	};
	return v;
}

describe("remote-control session-manager", () => {
	beforeEach(() => {
		__resetRemoteControlForTesting();
		initRemoteControlSecret("test-secret");
	});
	afterEach(() => {
		__resetRemoteControlForTesting();
	});

	test("token round-trip succeeds and decodes claims", () => {
		const minted = mintRemoteControlToken({
			sessionId: "00000000-0000-0000-0000-000000000001",
			terminalId: "term-1",
			workspaceId: "00000000-0000-0000-0000-000000000aaa",
			mode: "full",
			createdByUserId: "00000000-0000-0000-0000-000000000bbb",
		});
		expect(minted.token.split(".")).toHaveLength(3);
		const verified = verifyRemoteControlToken(minted.token);
		expect(verified.ok).toBe(true);
		if (verified.ok) {
			expect(verified.claims.sid).toBe("00000000-0000-0000-0000-000000000001");
			expect(verified.claims.mode).toBe("full");
		}
	});

	test("tampered signature is rejected", () => {
		const { token } = mintRemoteControlToken({
			sessionId: "s",
			terminalId: "t",
			workspaceId: "w",
			mode: "command",
			createdByUserId: "u",
		});
		const [c, _sig, n] = token.split(".");
		const bad = `${c}.AAAA.${n}`;
		const v = verifyRemoteControlToken(bad);
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.reason).toBe("bad-signature");
	});

	test("expired token rejected", () => {
		const { token } = mintRemoteControlToken({
			sessionId: "s",
			terminalId: "t",
			workspaceId: "w",
			mode: "full",
			createdByUserId: "u",
			ttlSec: 60,
		});
		const realDateNow = Date.now;
		Date.now = () => realDateNow() + 120_000;
		try {
			const v = verifyRemoteControlToken(token);
			expect(v.ok).toBe(false);
			if (!v.ok) expect(v.reason).toBe("expired");
		} finally {
			Date.now = realDateNow;
		}
	});

	test("rotating the secret invalidates old tokens", () => {
		const { token } = mintRemoteControlToken({
			sessionId: "s",
			terminalId: "t",
			workspaceId: "w",
			mode: "full",
			createdByUserId: "u",
		});
		__resetRemoteControlForTesting();
		initRemoteControlSecret("different-secret");
		const v = verifyRemoteControlToken(token);
		expect(v.ok).toBe(false);
	});

	test("authenticateSession rejects sessionId mismatch", () => {
		const minted = mintRemoteControlToken({
			sessionId: "real-sid",
			terminalId: "t",
			workspaceId: "w",
			mode: "full",
			createdByUserId: "u",
		});
		registerRemoteControlSession({
			sessionId: "real-sid",
			terminalId: "t",
			workspaceId: "w",
			mode: "full",
			tokenHash: minted.tokenHash,
			expiresAt: minted.expiresAt,
		});
		const r = authenticateSession("other-sid", minted.token);
		expect(r.ok).toBe(false);
	});

	test("authenticateSession ok then viewer cap enforced", () => {
		const sid = "cap-sid";
		const minted = mintRemoteControlToken({
			sessionId: sid,
			terminalId: "t",
			workspaceId: "w",
			mode: "full",
			createdByUserId: "u",
		});
		registerRemoteControlSession({
			sessionId: sid,
			terminalId: "t",
			workspaceId: "w",
			mode: "full",
			tokenHash: minted.tokenHash,
			expiresAt: minted.expiresAt,
		});
		const r = authenticateSession(sid, minted.token);
		expect(r.ok).toBe(true);
		for (let i = 0; i < 4; i += 1) {
			const ok = addViewer(sid, fakeViewer());
			expect(ok.ok).toBe(true);
		}
		const overflow = addViewer(sid, fakeViewer());
		expect(overflow.ok).toBe(false);
		if (!overflow.ok) expect(overflow.reason).toBe("max-viewers");
		expect(viewerCount(sid)).toBe(4);
	});

	test("revokeSession fans out and closes viewers", () => {
		const sid = "rev-sid";
		const minted = mintRemoteControlToken({
			sessionId: sid,
			terminalId: "t",
			workspaceId: "w",
			mode: "full",
			createdByUserId: "u",
		});
		registerRemoteControlSession({
			sessionId: sid,
			terminalId: "t",
			workspaceId: "w",
			mode: "full",
			tokenHash: minted.tokenHash,
			expiresAt: minted.expiresAt,
		});
		const v1 = fakeViewer();
		const v2 = fakeViewer();
		addViewer(sid, v1);
		addViewer(sid, v2);
		const fired: string[] = [];
		onRevoke(sid, (reason) => {
			fired.push(reason);
		});
		revokeSession(sid, "manual");
		expect(fired).toEqual(["manual"]);
		expect(v1.closed).toBe(true);
		expect(v2.closed).toBe(true);
		expect(getActiveSessionMode(sid)).toBeNull();
	});

	test("revokeSessionsForTerminal sweeps matching sessions", () => {
		const term = "shared-term";
		for (const sid of ["a", "b", "c"]) {
			const minted = mintRemoteControlToken({
				sessionId: sid,
				terminalId: term,
				workspaceId: "w",
				mode: "full",
				createdByUserId: "u",
			});
			registerRemoteControlSession({
				sessionId: sid,
				terminalId: term,
				workspaceId: "w",
				mode: "full",
				tokenHash: minted.tokenHash,
				expiresAt: minted.expiresAt,
			});
		}
		expect(listActiveSessions()).toHaveLength(3);
		revokeSessionsForTerminal(term);
		expect(listActiveSessions()).toHaveLength(0);
	});

	test("expiry sweep removes expired sessions", async () => {
		const sid = "expiring";
		const minted = mintRemoteControlToken({
			sessionId: sid,
			terminalId: "t",
			workspaceId: "w",
			mode: "full",
			createdByUserId: "u",
		});
		registerRemoteControlSession({
			sessionId: sid,
			terminalId: "t",
			workspaceId: "w",
			mode: "full",
			tokenHash: minted.tokenHash,
			// already expired
			expiresAt: Math.floor(Date.now() / 1000) - 1,
		});
		startRemoteControlExpirySweep(20);
		await new Promise((r) => setTimeout(r, 60));
		stopRemoteControlExpirySweep();
		expect(getActiveSessionMode(sid)).toBeNull();
	});

	test("hashRemoteControlToken is deterministic", () => {
		const t = "abc.def.ghi";
		expect(hashRemoteControlToken(t)).toBe(hashRemoteControlToken(t));
	});
});
