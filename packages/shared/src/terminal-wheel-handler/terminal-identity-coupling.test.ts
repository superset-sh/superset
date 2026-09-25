import { describe, expect, it } from "bun:test";
import { TERMINAL_TERM_PROGRAM } from "../constants";

// Identities claude-code (and other agent TUIs) treat as "the terminal
// delivers full-fidelity wheel reports natively — trust the stream as-is,
// do not amplify". This is claude's kitty-class detection set.
const KITTY_CLASS_IDENTITIES = [
	"kitty",
	"ghostty",
	"iTerm.app",
	"WezTerm",
	"WarpTerminal",
];

describe("terminal identity ↔ wheel handler coupling", () => {
	// This test is deliberately colocated with the wheel handler: the two
	// halves must never diverge, and each fails differently when they do.
	//
	// - TERM_PROGRAM reverted to "vscode" while this handler ships → TUIs
	//   amplify an already full-rate report stream → ~3x over-scroll.
	// - Handler removed while TERM_PROGRAM stays kitty-class → TUIs trust a
	//   damped stock stream → scrolling crawls at ~30% (the pre-#5563 bug).
	//
	// If you are changing TERMINAL_TERM_PROGRAM: either keep it kitty-class,
	// or remove/adjust the wheel handler in the same PR and delete this test
	// with a written rationale. Context: PRs #5563, #5639, #5641 and
	// plans/20260709-term-program-vscode-migration.md.
	it("TERM_PROGRAM claims a kitty-class terminal while the full-fidelity wheel handler ships", () => {
		expect(KITTY_CLASS_IDENTITIES).toContain(TERMINAL_TERM_PROGRAM);
	});
});
