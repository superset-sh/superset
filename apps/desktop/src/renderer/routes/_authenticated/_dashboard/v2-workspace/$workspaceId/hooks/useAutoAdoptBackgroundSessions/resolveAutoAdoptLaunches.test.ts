import { describe, expect, test } from "bun:test";
import {
	getAttachedChatSessionIds,
	resolveAutoAdoptLaunches,
} from "./resolveAutoAdoptLaunches";

describe("resolveAutoAdoptLaunches", () => {
	// Repro for #5800: a chat/`superset` agent launched via
	// `superset workspaces create --agent <id> --prompt …` produces a chat
	// session with no pane. Before chat sessions were considered here, the
	// on-open bridge was terminal-only, so the agent never became a foreground
	// pane and — unlike a terminal session — never even showed up in the
	// background-terminals dropdown. The workspace just rendered the empty
	// "Open Terminal" state.
	test("adopts a CLI-launched chat agent session that has no pane", () => {
		expect(
			resolveAutoAdoptLaunches({
				terminalSessions: [],
				chatSessions: [{ id: "chat-1", createdAt: 5 }],
				attachedTerminalIds: [],
				attachedChatSessionIds: [],
				markedTerminalIds: [],
			}),
		).toEqual([{ kind: "chat", id: "chat-1" }]);
	});

	test("still adopts an unattached terminal agent session", () => {
		expect(
			resolveAutoAdoptLaunches({
				terminalSessions: [{ terminalId: "term-1", createdAt: 1 }],
				chatSessions: [],
				attachedTerminalIds: [],
				attachedChatSessionIds: [],
				markedTerminalIds: [],
			}),
		).toEqual([{ kind: "terminal", id: "term-1" }]);
	});

	test("orders launches chronologically across terminal and chat kinds", () => {
		expect(
			resolveAutoAdoptLaunches({
				terminalSessions: [{ terminalId: "term-late", createdAt: 30 }],
				chatSessions: [
					{ id: "chat-early", createdAt: 2 },
					{ id: "chat-mid", createdAt: 20 },
				],
				attachedTerminalIds: [],
				attachedChatSessionIds: [],
				markedTerminalIds: [],
			}),
		).toEqual([
			{ kind: "chat", id: "chat-early" },
			{ kind: "chat", id: "chat-mid" },
			{ kind: "terminal", id: "term-late" },
		]);
	});

	test("skips already-attached and deliberately-backgrounded sessions", () => {
		expect(
			resolveAutoAdoptLaunches({
				terminalSessions: [
					{ terminalId: "term-attached", createdAt: 1 },
					{ terminalId: "term-marked", createdAt: 2 },
					{ terminalId: "term-fresh", createdAt: 3 },
				],
				chatSessions: [
					{ id: "chat-attached", createdAt: 4 },
					{ id: "chat-fresh", createdAt: 5 },
				],
				attachedTerminalIds: ["term-attached"],
				attachedChatSessionIds: ["chat-attached"],
				markedTerminalIds: ["term-marked"],
			}),
		).toEqual([
			{ kind: "terminal", id: "term-fresh" },
			{ kind: "chat", id: "chat-fresh" },
		]);
	});
});

describe("getAttachedChatSessionIds", () => {
	test("collects chat pane session ids and ignores non-chat panes", () => {
		expect(
			getAttachedChatSessionIds([
				{
					panes: {
						a: { kind: "chat", data: { sessionId: "chat-a" } },
						b: { kind: "terminal", data: { terminalId: "term-b" } },
					},
				},
				{
					panes: {
						c: { kind: "chat", data: { sessionId: "chat-c" } },
						d: { kind: "chat", data: { sessionId: null } },
					},
				},
			]).sort(),
		).toEqual(["chat-a", "chat-c"]);
	});
});
