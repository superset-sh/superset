/**
 * Regression test for issue #2184: Cannot copy text from agent outputs (Codex)
 *
 * The Conversation component wraps agent chat output with overflow-y-hidden.
 * In Electron/Chromium, an overflow:hidden container that inherits user-select:none
 * from the body can prevent text selection in child elements, even when those children
 * explicitly apply user-select:text. Adding select-text to the Conversation container
 * itself ensures selection works reliably throughout the entire chat area.
 */
import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// Mock use-stick-to-bottom to avoid browser DOM APIs in test environment
const mockContext = {
	isAtBottom: true,
	scrollToBottom: () => {},
	stopScroll: () => {},
	scrollRef: { current: null },
	contentRef: { current: null },
	escapedFromLock: false,
	state: "idle",
};

function MockStickToBottom({
	className,
	children,
	role,
}: {
	className?: string;
	children?: React.ReactNode;
	role?: string;
}) {
	return (
		<div className={className} role={role}>
			{children}
		</div>
	);
}

MockStickToBottom.Content = function MockContent({
	className,
	children,
	scrollClassName,
}: {
	className?: string;
	children?: React.ReactNode;
	scrollClassName?: string;
}) {
	return (
		<div className={scrollClassName}>
			<div className={className}>{children}</div>
		</div>
	);
};

mock.module("use-stick-to-bottom", () => ({
	StickToBottom: MockStickToBottom,
	useStickToBottomContext: () => mockContext,
}));

const { Conversation, ConversationContent } = await import(
	"@superset/ui/ai-elements/conversation"
);

describe("Conversation — text selection CSS", () => {
	it("Conversation outer container has select-text to allow text selection in Electron", () => {
		// Without select-text here, overflow-y-hidden + inherited user-select:none from
		// the body prevents text selection in Electron even if inner elements set select-text.
		const html = renderToStaticMarkup(
			<Conversation>
				<div>agent output text</div>
			</Conversation>,
		);

		expect(html).toContain("select-text");
	});

	it("ConversationContent has select-text class", () => {
		const html = renderToStaticMarkup(
			<Conversation>
				<ConversationContent>
					<p>test message</p>
				</ConversationContent>
			</Conversation>,
		);

		expect(html).toContain("select-text");
	});
});
