import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// Mock heavy dependencies that are not relevant to the test
mock.module("@superset/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DropdownMenuItem: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

mock.module("renderer/lib/tiptap/code-block-languages", () => ({
	FILE_VIEW_CODE_BLOCK_LANGUAGES: [
		{ value: "plaintext", label: "Plain Text" },
		{ value: "mermaid", label: "Mermaid" },
	],
	getCodeBlockLanguageLabel: (_langs: unknown, lang: string) =>
		lang === "mermaid" ? "Mermaid" : "Plain Text",
}));

mock.module("@tiptap/react", () => ({
	NodeViewWrapper: ({
		children,
		...props
	}: {
		children: React.ReactNode;
		as?: string;
		className?: string;
	}) => <div {...props}>{children}</div>,
	NodeViewContent: () => <div data-testid="node-view-content" />,
}));

// Mock CodeBlock to avoid transitive renderer/stores → trpc dependency chain.
// The mock renders a detectable element so we can verify mermaid delegation.
mock.module(
	"renderer/components/MarkdownRenderer/components/CodeBlock/CodeBlock",
	() => ({
		CodeBlock: ({
			children,
			className,
		}: {
			children: React.ReactNode;
			className?: string;
		}) => (
			<div data-testid="code-block" data-language={className}>
				{children}
			</div>
		),
	}),
);

import { EditableCodeBlockView } from "./EditableCodeBlockView";

function createMockNodeViewProps(language: string) {
	return {
		node: {
			attrs: { language },
			textContent: "graph TD\n  A-->B",
			type: { name: "codeBlock" },
			content: { size: 0 },
			isBlock: true,
			isInline: false,
			isText: false,
			isLeaf: false,
			childCount: 0,
			nodeSize: 0,
			marks: [],
			text: undefined,
		},
		updateAttributes: () => {},
		extension: {
			options: {
				HTMLAttributes: {
					class:
						"my-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm",
				},
			},
		},
		editor: {} as never,
		getPos: (() => 0) as () => number,
		decorations: [] as never,
		selected: false,
		deleteNode: () => {},
		HTMLAttributes: {},
		innerDecorations: [] as never,
	};
}

describe("EditableCodeBlockView mermaid rendering (#2637)", () => {
	it("should render mermaid code blocks as diagrams via CodeBlock, not raw code", () => {
		const props = createMockNodeViewProps("mermaid");
		const html = renderToStaticMarkup(
			<EditableCodeBlockView {...(props as never)} />,
		);

		// Mermaid code blocks should delegate to CodeBlock (which renders diagrams
		// via Streamdown + mermaid plugin), not render as plain editable text.
		expect(html).toContain('data-testid="code-block"');
		expect(html).toContain('data-language="language-mermaid"');
		// Should NOT contain the editable NodeViewContent
		expect(html).not.toContain('data-testid="node-view-content"');
	});

	it("should render non-mermaid code blocks as editable code", () => {
		const props = createMockNodeViewProps("javascript");
		const html = renderToStaticMarkup(
			<EditableCodeBlockView {...(props as never)} />,
		);

		// Non-mermaid code blocks should render as editable code with NodeViewContent
		expect(html).toContain('data-testid="node-view-content"');
		// Should NOT delegate to CodeBlock
		expect(html).not.toContain('data-testid="code-block"');
	});
});
