import { describe, expect, it } from "bun:test";
import { TRPCError } from "@trpc/server";
import type { TRPCContext } from "../../trpc";
import {
	agentSessionFor,
	assertActivatedForAgent,
	shouldActivateOnWrite,
} from "./agent-access";

const ctx = (agentCaller: TRPCContext["agentCaller"]) =>
	({ agentCaller }) as TRPCContext;

describe("agentSessionFor", () => {
	it("derives the session from the MCP transport, ignoring the body", () => {
		expect(agentSessionFor(ctx({ transport: "mcp", label: "claude" }))).toBe(
			"mcp:claude",
		);
	});

	it("does not let a body field downgrade an MCP call to human", () => {
		expect(
			agentSessionFor(ctx({ transport: "mcp", label: "claude" }), undefined),
		).toBe("mcp:claude");
	});

	it("falls back to the CLI's self-reported session", () => {
		expect(agentSessionFor(ctx(null), "pane-7")).toBe("pane-7");
	});

	it("treats a caller with neither signal as human", () => {
		expect(agentSessionFor(ctx(null))).toBeNull();
	});

	it("names an unlabelled MCP client rather than dropping attribution", () => {
		expect(agentSessionFor(ctx({ transport: "mcp", label: null }))).toBe(
			"mcp:unknown",
		);
	});
});

describe("shouldActivateOnWrite", () => {
	const fresh = { agentActivatedAt: null };
	const already = { agentActivatedAt: new Date() };

	it("opens a fresh thread when a person writes on it", () => {
		expect(shouldActivateOnWrite(fresh, null)).toBe(true);
	});

	it("does not re-stamp a thread that is already open", () => {
		expect(shouldActivateOnWrite(already, null)).toBe(false);
	});

	it("never activates on an agent's own write — that would be a self-invite", () => {
		expect(shouldActivateOnWrite(fresh, "pane-7")).toBe(false);
		expect(shouldActivateOnWrite(fresh, "mcp:claude")).toBe(false);
	});

	it("leaves an open thread open when an agent replies, so it can reply again", () => {
		expect(shouldActivateOnWrite(already, "pane-7")).toBe(false);
		expect(() => assertActivatedForAgent(already, "pane-7")).not.toThrow();
	});
});

describe("assertActivatedForAgent", () => {
	const activated = { agentActivatedAt: new Date() };
	const untouched = { agentActivatedAt: null };

	it("refuses an agent on a thread nobody handed off", () => {
		expect(() => assertActivatedForAgent(untouched, "mcp:claude")).toThrow(
			TRPCError,
		);
	});

	it("allows an agent on a thread that was handed off", () => {
		expect(() =>
			assertActivatedForAgent(activated, "mcp:claude"),
		).not.toThrow();
	});

	it("never gates a human, activated or not", () => {
		expect(() => assertActivatedForAgent(untouched, null)).not.toThrow();
		expect(() => assertActivatedForAgent(activated, null)).not.toThrow();
	});

	it("reports FORBIDDEN, not NOT_FOUND — the thread exists, the invite doesn't", () => {
		try {
			assertActivatedForAgent(untouched, "pane-7");
			throw new Error("expected a throw");
		} catch (error) {
			expect((error as TRPCError).code).toBe("FORBIDDEN");
		}
	});
});
