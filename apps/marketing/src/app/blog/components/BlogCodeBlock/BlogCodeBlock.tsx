"use client";

import {
	CodeBlock,
	CodeBlockCopyButton,
} from "@superset/ui/ai-elements/code-block";
import type { BundledLanguage } from "shiki";

interface BlogCodeBlockProps {
	code: string;
	language: BundledLanguage;
	showLineNumbers?: boolean;
}

export function BlogCodeBlock({
	code,
	language,
	showLineNumbers,
}: BlogCodeBlockProps) {
	return (
		<div className="blog-code-block not-prose my-6">
			<CodeBlock
				code={code}
				language={language}
				showLineNumbers={showLineNumbers}
			>
				<CodeBlockCopyButton />
			</CodeBlock>
		</div>
	);
}
