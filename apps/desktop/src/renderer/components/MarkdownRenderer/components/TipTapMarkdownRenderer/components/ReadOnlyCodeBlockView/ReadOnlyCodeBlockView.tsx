import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { CodeBlock } from "renderer/components/MarkdownRenderer/components";

export function ReadOnlyCodeBlockView({ node }: NodeViewProps) {
	const language =
		typeof node.attrs.language === "string" ? node.attrs.language : undefined;

	return (
		<NodeViewWrapper as="div" className="my-4">
			<CodeBlock className={language ? `language-${language}` : undefined}>
				{node.textContent}
			</CodeBlock>
		</NodeViewWrapper>
	);
}
