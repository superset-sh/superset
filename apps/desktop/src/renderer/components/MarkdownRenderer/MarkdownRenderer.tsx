import { cn } from "@superset/ui/utils";
import { useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { useMarkdownStyle } from "renderer/stores";
import { SelectionContextMenu } from "./components";
import { defaultConfig } from "./styles/default/config";
import { tufteConfig } from "./styles/tufte/config";

const styleConfigs = {
	default: defaultConfig,
	tufte: tufteConfig,
} as const;

interface MarkdownRendererProps {
	content: string;
	style?: keyof typeof styleConfigs;
	className?: string;
	/** Parse raw inline HTML. Disable for remote/untrusted content (e.g. server-driven notices). */
	allowHtml?: boolean;
	/** Element renderers layered over the style's own. */
	components?: Partial<Components>;
}

export function MarkdownRenderer({
	content,
	style: styleProp,
	className,
	allowHtml = true,
	components,
}: MarkdownRendererProps) {
	const globalStyle = useMarkdownStyle();
	const style = styleProp ?? globalStyle;
	const config = styleConfigs[style];
	const articleRef = useRef<HTMLElement | null>(null);

	return (
		<SelectionContextMenu selectAllContainerRef={articleRef}>
			<div
				className={cn(
					"markdown-renderer h-full overflow-y-auto select-text",
					config.wrapperClass,
					className,
				)}
			>
				<article ref={articleRef} className={config.articleClass}>
					<ReactMarkdown
						remarkPlugins={[remarkGfm]}
						rehypePlugins={
							allowHtml ? [rehypeRaw, rehypeSanitize] : [rehypeSanitize]
						}
						components={
							components
								? { ...config.components, ...components }
								: config.components
						}
					>
						{content}
					</ReactMarkdown>
				</article>
			</div>
		</SelectionContextMenu>
	);
}
