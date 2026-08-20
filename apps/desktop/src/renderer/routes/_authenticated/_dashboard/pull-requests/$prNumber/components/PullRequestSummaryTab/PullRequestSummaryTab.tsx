import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { PullRequestChecksSection } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestChecksSection";
import type { PullRequestCheck } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/pull-request-checks";

interface PullRequestSummaryTabProps {
	body: string;
	checks: PullRequestCheck[];
}

export function PullRequestSummaryTab({
	body,
	checks,
}: PullRequestSummaryTabProps) {
	return (
		<div className="grid w-full gap-8 px-4 py-6 @md:px-6 @4xl:grid-cols-[minmax(0,40rem)_1fr] @4xl:py-8">
			<article className="min-w-0">
				{body.trim() ? (
					<MarkdownRenderer content={body} />
				) : (
					<p className="text-sm italic text-muted-foreground">
						No description provided.
					</p>
				)}
			</article>

			<aside className="min-w-0 @4xl:sticky @4xl:top-6 @4xl:self-start">
				<PullRequestChecksSection checks={checks} />
			</aside>
		</div>
	);
}
