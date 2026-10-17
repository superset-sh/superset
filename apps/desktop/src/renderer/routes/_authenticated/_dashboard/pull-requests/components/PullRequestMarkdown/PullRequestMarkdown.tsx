import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { memo, useMemo } from "react";
import type { Components } from "react-markdown";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { SafeImage } from "renderer/components/MarkdownRenderer/components";
import { preparePullRequestMarkdown } from "../../utils/preparePullRequestMarkdown";
import { PullRequestLinkIcon } from "./components/PullRequestLinkIcon";
import {
	imageAlignment,
	PullRequestPicture,
} from "./components/PullRequestPicture";
import "./pull-request-markdown.css";

const EXTERNAL_HREF_PATTERN = /^https?:\/\//i;

interface MarkupNode {
	type: string;
	tagName?: string;
	children?: MarkupNode[];
}

/** A badge link is its own mark; adding the site's would stack two icons. */
function wrapsImage(node: MarkupNode | undefined): boolean {
	return (node?.children ?? []).some(
		(child) =>
			child.type === "element" &&
			(child.tagName === "img" ||
				child.tagName === "picture" ||
				wrapsImage(child)),
	);
}

/** GitHub-body renderers: images keep the markup's size, task boxes sit in
 *  the list gutter, tables are a framed grid. The description's links carry
 *  their site's mark; a comment's stay plain, as on GitHub. */
function proseComponents(linkMarks: boolean): Partial<Components> {
	return {
		a: ({ href, children, node }) => {
			const external =
				typeof href === "string" && EXTERNAL_HREF_PATTERN.test(href);
			const marked = linkMarks && external && !wrapsImage(node);
			return (
				<a
					href={href}
					target={external ? "_blank" : undefined}
					rel={external ? "noopener noreferrer" : undefined}
					className={marked ? "pr-prose-link" : undefined}
				>
					{marked ? <PullRequestLinkIcon url={href} /> : null}
					{children}
				</a>
			);
		},
		img: ({ src, alt, width, height, node }) => (
			<SafeImage
				src={src}
				alt={alt}
				width={width}
				height={height}
				align={imageAlignment(node?.properties.align)}
			/>
		),
		picture: ({ node }) => <PullRequestPicture node={node} />,
		li: ({ children, className }) => <li className={className}>{children}</li>,
		input: ({ type, checked }) =>
			type === "checkbox" ? (
				<input
					type="checkbox"
					className="pr-prose-task-checkbox"
					checked={checked === true}
					disabled
					readOnly
				/>
			) : null,
		table: ({ children }) => (
			<div className="pr-prose-table">
				<table>{children}</table>
			</div>
		),
		th: ({ children }) => <th>{children}</th>,
		td: ({ children }) => <td>{children}</td>,
	};
}

const PAGE_COMPONENTS = proseComponents(true);
const COMMENT_COMPONENTS = proseComponents(false);

interface PullRequestMarkdownProps {
	body: string;
	className?: string;
	/** Comment cards set smaller, tighter type than the description. */
	size?: "page" | "comment";
}

/** A GitHub body as page prose: template comments gone, no inner scroller. */
export const PullRequestMarkdown = memo(function PullRequestMarkdown({
	body,
	className,
	size = "page",
}: PullRequestMarkdownProps) {
	const { t } = useLingui();
	const prepared = useMemo(
		() =>
			preparePullRequestMarkdown(body, {
				note: t({ message: "Note" }),
				tip: t({ message: "Tip" }),
				important: t({ message: "Important" }),
				warning: t({ message: "Warning" }),
				caution: t({ message: "Caution" }),
			}),
		[body, t],
	);
	if (!prepared) {
		return (
			<p className={cn("text-sm italic text-muted-foreground", className)}>
				<Trans>No description provided.</Trans>
			</p>
		);
	}
	return (
		<MarkdownRenderer
			content={prepared}
			style="default"
			components={size === "comment" ? COMMENT_COMPONENTS : PAGE_COMPONENTS}
			className={cn(
				"pull-request-markdown h-auto overflow-visible",
				size === "comment" && "pull-request-markdown-comment",
				className,
			)}
		/>
	);
});
