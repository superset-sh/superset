import type { ReactNode } from "react";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";
import {
	type PullRequestCommentTarget,
	PullRequestConversation,
} from "../PullRequestConversation";
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
	aside?: ReactNode;
}

/** The Summary tab: header, info rail, description, conversation, then whatever the host adds. */
export function PullRequestSummaryContent({
	data,
	commentTarget = null,
	children,
	aside,
}: PullRequestSummaryContentProps) {
	return (
		<PullRequestPageBody
			header={
				<PullRequestItemHeader data={data} actionTarget={commentTarget} />
			}
			info={(variant) => (
				<div className="space-y-6">
					<PullRequestInfo data={data} variant={variant} />
					{aside}
				</div>
			)}
		>
			<PullRequestMarkdown body={data.body} />
			<div className="mt-6">
				<PullRequestConversation data={data} commentTarget={commentTarget} />
			</div>
			{children ? <div className="mt-8">{children}</div> : null}
		</PullRequestPageBody>
	);
}
