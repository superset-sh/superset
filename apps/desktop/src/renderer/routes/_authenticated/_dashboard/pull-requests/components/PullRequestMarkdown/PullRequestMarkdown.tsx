import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { Components } from "react-markdown";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { preparePullRequestMarkdown } from "../../utils/preparePullRequestMarkdown";
import { PullRequestLinkIcon } from "./components/PullRequestLinkIcon";
import "./pull-request-markdown.css";

const EXTERNAL_HREF_PATTERN = /^https?:\/\//i;

/** GitHub-body renderers: links carry their site's mark, task boxes sit in
 *  the list gutter, tables are a bordered grid. */
const PROSE_COMPONENTS: Partial<Components> = {
	a: ({ href, children }) => {
		const external =
			typeof href === "string" && EXTERNAL_HREF_PATTERN.test(href);
		return (
			<a
				href={href}
				target={external ? "_blank" : undefined}
				rel={external ? "noopener noreferrer" : undefined}
				className={external ? "pr-prose-link" : undefined}
			>
				{external ? <PullRequestLinkIcon url={href} /> : null}
				{children}
			</a>
		);
	},
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

interface PullRequestMarkdownProps {
	body: string;
	className?: string;
}

/** A GitHub body as page prose: template comments gone, no inner scroller. */
export function PullRequestMarkdown({
	body,
	className,
}: PullRequestMarkdownProps) {
	const { t } = useLingui();
	const prepared = preparePullRequestMarkdown(body, {
		note: t({ message: "Note" }),
		tip: t({ message: "Tip" }),
		important: t({ message: "Important" }),
		warning: t({ message: "Warning" }),
		caution: t({ message: "Caution" }),
	});
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
			components={PROSE_COMPONENTS}
			className={cn("pull-request-markdown h-auto overflow-visible", className)}
		/>
	);
}
