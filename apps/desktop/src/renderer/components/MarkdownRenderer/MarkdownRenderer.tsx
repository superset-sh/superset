import { cn } from "@superset/ui/utils";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { useMarkdownStyle } from "renderer/stores";
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
}

export function MarkdownRenderer({
	content,
	style: styleProp,
	className,
}: MarkdownRendererProps) {
	const globalStyle = useMarkdownStyle();
	const style = styleProp ?? globalStyle;
	const config = styleConfigs[style];

	return (
		<div
			className={cn(
				"markdown-renderer h-full overflow-y-auto",
				config.wrapperClass,
				className,
			)}
		>
			<article className={config.articleClass}>
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					rehypePlugins={[rehypeRaw, rehypeSanitize]}
					components={config.components}
				>
					{content}
				</ReactMarkdown>
			</article>
		</div>
	);
}
