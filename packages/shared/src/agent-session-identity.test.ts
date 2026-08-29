import { describe, expect, it } from "bun:test";
import {
	type AgentSessionIdentityInput,
	buildAgentSessionIdentity,
	deriveAgentSessionState,
	isAgentSessionResumable,
} from "./agent-session-identity";

const CLAUDE_RESUME_ARGS = ["--resume"];

function identity(overrides: AgentSessionIdentityInput = {}) {
	return buildAgentSessionIdentity({
		presetId: "claude",
		agentSessionId: "prov-1",
		resumeArgs: CLAUDE_RESUME_ARGS,
		lastEventType: "Stop",
		lastEventAt: 1_700_000_000_000,
		startedAt: 1_699_999_999_000,
		...overrides,
	});
}

describe("deriveAgentSessionState", () => {
	it("maps the lifecycle event types to provider-neutral states", () => {
		expect(deriveAgentSessionState({ lastEventType: "Start" })).toBe("working");
		expect(deriveAgentSessionState({ lastEventType: "PermissionRequest" })).toBe(
			"awaiting-input",
		);
		expect(deriveAgentSessionState({ lastEventType: "Failed" })).toBe("failed");
		expect(deriveAgentSessionState({ lastEventType: "Stop" })).toBe("idle");
		expect(deriveAgentSessionState({ lastEventType: "Attached" })).toBe("idle");
	});

	it("reports starting until the first lifecycle event lands", () => {
		expect(deriveAgentSessionState({ lastEventType: null })).toBe("starting");
		expect(deriveAgentSessionState({})).toBe("starting");
	});

	it("treats an unrecognized event as idle rather than working", () => {
		expect(deriveAgentSessionState({ lastEventType: "Whatever" })).toBe("idle");
	});

	it("reports ended even when the last event said the agent was working", () => {
		expect(
			deriveAgentSessionState({ lastEventType: "Start", ended: true }),
		).toBe("ended");
		expect(
			deriveAgentSessionState({
				lastEventType: "PermissionRequest",
				ended: true,
			}),
		).toBe("ended");
	});
});

describe("isAgentSessionResumable", () => {
	it("is true for a persisted session id on a preset with resume args", () => {
		expect(
			isAgentSessionResumable({
				agentSessionId: "prov-1",
				resumeArgs: CLAUDE_RESUME_ARGS,
				lastEventType: "Stop",
			}),
		).toBe(true);
	});

	it("is false when the preset declares no resume args", () => {
		expect(
			isAgentSessionResumable({
				agentSessionId: "prov-1",
				resumeArgs: [],
				lastEventType: "Stop",
			}),
		).toBe(false);
		expect(
			isAgentSessionResumable({
				agentSessionId: "prov-1",
				lastEventType: "Stop",
			}),
		).toBe(false);
	});

	it("is false without a provider session id", () => {
		expect(
			isAgentSessionResumable({
				resumeArgs: CLAUDE_RESUME_ARGS,
				lastEventType: "Stop",
			}),
		).toBe(false);
	});

	it("is false for a session that never got past attach", () => {
		expect(
			isAgentSessionResumable({
				agentSessionId: "prov-1",
				resumeArgs: CLAUDE_RESUME_ARGS,
				lastEventType: "Attached",
			}),
		).toBe(false);
	});

	it("stays true after the session ended — that is the whole point", () => {
		expect(
			isAgentSessionResumable({
				agentSessionId: "prov-1",
				resumeArgs: CLAUDE_RESUME_ARGS,
				lastEventType: "Stop",
				endedAt: 1_700_000_001_000,
			}),
		).toBe(true);
	});

	it("stays true for end reasons the host will not auto-resume", () => {
		// "detached" and "disposed" bar Superset from restoring a pane on its
		// own; neither invalidates the provider's conversation id.
		for (const endReason of ["detached", "disposed", "resumed"]) {
			expect(
				buildAgentSessionIdentity({
					agentSessionId: "prov-1",
					resumeArgs: CLAUDE_RESUME_ARGS,
					lastEventType: "Stop",
					endedAt: 1_700_000_001_000,
					endReason,
				}).resumable,
			).toBe(true);
		}
	});
});

describe("buildAgentSessionIdentity", () => {
	it("exposes the provider session id verbatim, uninterpreted", () => {
		const built = identity({ agentSessionId: "  0b7c-NOT-normalized  " });
		expect(built.sessionId).toBe("  0b7c-NOT-normalized  ");
	});

	it("renders timestamps as ISO 8601", () => {
		const built = identity();
		expect(built.lastEventAt).toBe("2023-11-14T22:13:20.000Z");
		expect(built.startedAt).toBe("2023-11-14T22:13:19.000Z");
		expect(built.endedAt).toBeNull();
		expect(built.ended).toBe(false);
	});

	it("reports an ended agent whose shell is still open as ended", () => {
		const built = identity({
			lastEventType: "Start",
			endedAt: 1_700_000_005_000,
			endReason: "detached",
		});
		expect(built.state).toBe("ended");
		expect(built.ended).toBe(true);
		expect(built.endedAt).toBe("2023-11-14T22:13:25.000Z");
		expect(built.endReason).toBe("detached");
		expect(built.resumable).toBe(true);
	});

	it("describes a launch whose binding has not landed yet", () => {
		const built = buildAgentSessionIdentity({
			presetId: "codex",
			resumeArgs: ["resume"],
		});
		expect(built).toEqual({
			presetId: "codex",
			sessionId: null,
			resumable: false,
			state: "starting",
			lastEventType: null,
			lastEventAt: null,
			startedAt: null,
			ended: false,
			endedAt: null,
			endReason: null,
		});
	});

	it("keeps a preset with no resume contract honest", () => {
		const built = identity({ presetId: "vibe", resumeArgs: [] });
		expect(built.resumable).toBe(false);
		expect(built.presetId).toBe("vibe");
	});
});
