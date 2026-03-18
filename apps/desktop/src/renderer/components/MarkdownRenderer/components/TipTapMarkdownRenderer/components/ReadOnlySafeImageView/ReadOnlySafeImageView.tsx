import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { SafeImage } from "renderer/components/MarkdownRenderer/components";

export function ReadOnlySafeImageView({ node }: NodeViewProps) {
	const src = typeof node.attrs.src === "string" ? node.attrs.src : undefined;
	const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : undefined;

	return (
		<NodeViewWrapper as="div" className="my-4">
			<SafeImage src={src} alt={alt} className="max-w-full h-auto rounded-md" />
		</NodeViewWrapper>
	);
}
