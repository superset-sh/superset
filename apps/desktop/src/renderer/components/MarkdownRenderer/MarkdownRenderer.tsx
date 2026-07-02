import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useMarkdownStyle } from "renderer/stores";
import { SelectionContextMenu } from "./components";
import { defaultConfig } from "./styles/default/config";
import { tufteConfig } from "./styles/tufte/config";

// Prose readability (line-height + base font weight) follows the editor font
// settings so reading surfaces stay consistent. The CSS variables are only set
// when the user has an explicit override — otherwise each markdown style keeps
// its own tuned defaults (see the `var(..., <fallback>)` declarations). Bold
// text and headings carry their own weights/line-heights and are unaffected.

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
	const articleRef = useRef<HTMLElement | null>(null);

	const { data: fontSettings } = useQuery({
		queryKey: ["electron", "settings", "getFontSettings"],
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});

	const proseVars: Record<string, string | number> = {};
	if (fontSettings?.editorLineHeight != null) {
		proseVars["--md-line-height"] = fontSettings.editorLineHeight;
	}
	if (fontSettings?.editorFontWeight != null) {
		proseVars["--md-font-weight"] = fontSettings.editorFontWeight;
	}
	const proseStyle = proseVars as CSSProperties;

	return (
		<SelectionContextMenu selectAllContainerRef={articleRef}>
			<div
				style={proseStyle}
				className={cn(
					"markdown-renderer h-full overflow-y-auto select-text",
					config.wrapperClass,
					className,
				)}
			>
				<article ref={articleRef} className={config.articleClass}>
					<ReactMarkdown
						remarkPlugins={[remarkGfm]}
						rehypePlugins={[rehypeRaw, rehypeSanitize]}
						components={config.components}
					>
						{content}
					</ReactMarkdown>
				</article>
			</div>
		</SelectionContextMenu>
	);
}
