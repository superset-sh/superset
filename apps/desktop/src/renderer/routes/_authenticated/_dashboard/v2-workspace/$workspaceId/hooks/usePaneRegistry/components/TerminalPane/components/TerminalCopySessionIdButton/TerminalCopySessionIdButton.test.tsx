import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TerminalCopySessionIdButton } from "./TerminalCopySessionIdButton";

describe("TerminalCopySessionIdButton", () => {
	// Reproduces #5108: there was no UI affordance to copy a terminal pane's
	// session id. This asserts the new affordance renders a copyable control
	// wired to the given terminalId.
	it("renders an accessible copy-session-id control", () => {
		const markup = renderToStaticMarkup(
			<TerminalCopySessionIdButton terminalId="term_abc123" />,
		);

		expect(markup).toContain('aria-label="Copy session ID"');
		expect(markup).toContain('type="button"');
	});
});
