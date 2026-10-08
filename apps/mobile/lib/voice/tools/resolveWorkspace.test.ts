import { describe, expect, test } from "bun:test";
import { resolveSession, resolveWorkspace } from "./resolveWorkspace";
import type { VoiceSessionRow, VoiceWorkspace } from "./types";

const workspace = (
	id: string,
	name: string,
	extra: Partial<VoiceWorkspace> = {},
): VoiceWorkspace => ({
	id,
	name,
	kind: "cloud",
	organizationId: "org",
	hostId: id,
	hostName: null,
	branch: null,
	project: null,
	status: "ready",
	attention: null,
	attentionAt: null,
	lastActivityAt: null,
	createdByMe: true,
	...extra,
});

const all = [
	workspace("1", "auth-refactor", { lastActivityAt: 10 }),
	workspace("2", "dashboard-v2", { lastActivityAt: 20 }),
	workspace("3", "billing-webhooks", { lastActivityAt: 30 }),
	workspace("4", "auth-tokens-cleanup", { lastActivityAt: 5 }),
];

describe("resolveWorkspace", () => {
	test("exact name wins outright even with a similar sibling", () => {
		const result = resolveWorkspace("auth-refactor", all);
		expect(result).toEqual({ kind: "match", workspace: all[0] });
	});

	test("a spoken fragment matches by substring", () => {
		expect(resolveWorkspace("dashboard", all)).toEqual({
			kind: "match",
			workspace: all[1],
		});
	});

	test("punctuation lost in speech still matches", () => {
		expect(resolveWorkspace("billing webhooks", all)).toEqual({
			kind: "match",
			workspace: all[2],
		});
	});

	test("a fragment shared by two names is ambiguous", () => {
		const result = resolveWorkspace("auth", all);
		expect(result.kind).toBe("ambiguous");
		if (result.kind === "ambiguous") {
			expect(result.candidates.map((w) => w.name)).toEqual([
				"auth-refactor",
				"auth-tokens-cleanup",
			]);
		}
	});

	test("an id resolves directly", () => {
		expect(resolveWorkspace("3", all)).toEqual({
			kind: "match",
			workspace: all[2],
		});
	});

	test("nothing related is none", () => {
		expect(resolveWorkspace("marketing site", all)).toEqual({ kind: "none" });
	});
});

describe("resolveSession", () => {
	const sessions: VoiceSessionRow[] = [
		{
			terminalId: "t1",
			workspaceId: "1",
			title: "shell",
			agentId: null,
			attention: null,
			lastEventAt: null,
			createdAt: 100,
		},
		{
			terminalId: "t2",
			workspaceId: "1",
			title: "claude",
			agentId: "claude",
			attention: "review",
			lastEventAt: 500,
			createdAt: 200,
		},
	];

	test("defaults to the most recently active session", () => {
		expect(resolveSession(undefined, sessions)?.terminalId).toBe("t2");
	});

	test("finds a session by agent name", () => {
		expect(resolveSession("Claude", sessions)?.terminalId).toBe("t2");
	});

	test("finds a plain shell by title", () => {
		expect(resolveSession("shell", sessions)?.terminalId).toBe("t1");
	});

	test("unknown names resolve to nothing rather than a guess", () => {
		expect(resolveSession("codex", sessions)).toBeNull();
	});
});
