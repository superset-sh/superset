import type { ReactNode } from "react";
import { CommentMarkdown } from "renderer/components/CommentMarkdown";
import { CopyableTable } from "./components/CopyableTable";
import "./comment-body.css";
const components = {
	table: ({ children }: { children?: ReactNode }) => (
		<CopyableTable>{children}</CopyableTable>
	),
};
export function CommentBody({ body }: { body: string }) {
	return (
		<div className="comment-pane-markdown min-w-0 select-text">
			<article>
				<CommentMarkdown body={body} components={components} />
			</article>
		</div>
	);
}
