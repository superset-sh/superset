import { CodeBlock, SafeImage } from "../../components";
import type { MarkdownStyleConfig } from "../types";
import "./tufte.css";

export const tufteConfig: MarkdownStyleConfig = {
	wrapperClass: "tufte-markdown",
	articleClass: "",
	components: {
		// Minimal overrides - let CSS handle styling
		code: ({ className, children, node }) => (
			<CodeBlock className={className} node={node}>
				{children}
			</CodeBlock>
		),
		// Block external images for privacy (tracking pixels, etc.)
		img: ({ src, alt }) => <SafeImage src={src} alt={alt} />,
	},
};
