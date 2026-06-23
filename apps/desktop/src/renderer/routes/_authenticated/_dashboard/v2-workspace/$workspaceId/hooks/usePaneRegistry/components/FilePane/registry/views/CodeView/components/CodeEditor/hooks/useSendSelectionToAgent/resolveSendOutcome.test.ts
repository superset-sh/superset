import { describe, expect, it } from "bun:test";
import type { AgentTarget } from "../../../../../../../../DiffPane/components/AgentCommentComposer";
import type { CapturedEditorSelection } from "../../CodeEditorAdapter";
import { resolveSendOutcome } from "./resolveSendOutcome";

const region = (
	overrides?: Partial<CapturedEditorSelection>,
): CapturedEditorSelection => ({
	path: "src/a.ts",
	startLine: 40,
	endLine: 60,
	text: "const a = 1;",
	...overrides,
});

const existing: AgentTarget = { kind: "existing", terminalId: "term-7" };
const newSession: AgentTarget = {
	kind: "new",
	configId: "cfg-1",
	placement: "split-pane",
};

describe("resolveSendOutcome — send() pre-dispatch decision", () => {
	it("returns 'no-selection' for a null capture (send is inert)", () => {
		expect(resolveSendOutcome(null, existing)).toBe("no-selection");
	});

	it("returns 'no-selection' for an undefined capture (no editor)", () => {
		expect(resolveSendOutcome(undefined, newSession)).toBe("no-selection");
	});

	it("returns 'no-selection' for an unresolvable region even when a target exists", () => {
		expect(resolveSendOutcome(region({ path: "" }), existing)).toBe(
			"no-selection",
		);
	});

	it("returns 'no-agent' when a sendable selection has no resolved target (empty ladder — no live agent AND no config)", () => {
		expect(resolveSendOutcome(region(), null)).toBe("no-agent");
	});

	it("prioritizes 'no-selection' over 'no-agent' when both are true (refuse first, never a misleading no-agent toast on an empty selection)", () => {
		expect(resolveSendOutcome(null, null)).toBe("no-selection");
	});

	it("returns 'dispatch' for a sendable selection into an existing terminal session", () => {
		expect(resolveSendOutcome(region(), existing)).toBe("dispatch");
	});

	it("returns 'dispatch' for a sendable selection into a {kind:'new'} session (config exists, no live agent)", () => {
		expect(resolveSendOutcome(region(), newSession)).toBe("dispatch");
	});
});
