import { CodeBlock } from "../../components";
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
	},
};
