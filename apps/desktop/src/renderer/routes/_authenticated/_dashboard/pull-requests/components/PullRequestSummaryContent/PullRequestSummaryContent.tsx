import type { ReactNode } from "react";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";
import { PullRequestConversation } from "../PullRequestConversation";
import {
	type PullRequestCommentTarget,
	PullRequestConversationComposer,
} from "../PullRequestConversationComposer";
import { PullRequestInfo } from "../PullRequestInfo";
import { PullRequestItemHeader } from "../PullRequestItemHeader";
import { PullRequestMarkdown } from "../PullRequestMarkdown";
import { PullRequestPageBody } from "../PullRequestPageBody";

interface PullRequestSummaryContentProps {
	data: PullRequestDetail;
	/** Where a new conversation comment posts; null hides the composer. */
	commentTarget?: PullRequestCommentTarget | null;
	/** Rendered under the conversation (the workspace pane's review threads). */
	children?: ReactNode;
}

/**
 * The Summary tab: header, info rail, description, conversation, whatever
 * the host adds, and the composer last so it is where the scroll ends.
 */
export function PullRequestSummaryContent({
	data,
	commentTarget = null,
	children,
}: PullRequestSummaryContentProps) {
	return (
		<PullRequestPageBody
			header={
				<PullRequestItemHeader data={data} actionTarget={commentTarget} />
			}
			info={(variant) => <PullRequestInfo data={data} variant={variant} />}
		>
			<PullRequestMarkdown body={data.body} />
			<div className="mt-6">
				<PullRequestConversation data={data} />
			</div>
			{children ? <div className="mt-8">{children}</div> : null}
			{commentTarget ? (
				<div className={children ? "mt-6" : "mt-2"}>
					<PullRequestConversationComposer target={commentTarget} />
				</div>
			) : null}
		</PullRequestPageBody>
	);
}
