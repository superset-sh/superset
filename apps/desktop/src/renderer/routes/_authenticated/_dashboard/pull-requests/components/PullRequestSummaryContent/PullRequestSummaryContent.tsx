import { Trans, useLingui } from "@lingui/react/macro";
import { ScrollArea } from "@superset/ui/scroll-area";
import type { ReactNode } from "react";
import { LuPencil } from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";
import { PullRequestChecksSection } from "../PullRequestChecksSection";

interface PullRequestSummaryContentProps {
	data: PullRequestDetail;
	children?: ReactNode;
}

/**
 * The PR's description beside its checks — the Summary tab's body. Lays
 * out on container width (`@3xl` puts checks in a sticky side column), so
 * the parent must be a `@container`.
 */
export function PullRequestSummaryContent({
	data,
	children,
}: PullRequestSummaryContentProps) {
	const { t } = useLingui();
	return (
		<ScrollArea className="h-full">
			<div className="grid w-full gap-8 px-4 pt-3 pb-6 @md:px-6 @md:pt-4 @3xl:grid-cols-[minmax(0,1fr)_20rem] @3xl:pb-8">
				<div className="min-w-0 space-y-8">
					<article className="group/description relative min-w-0">
						<a
							href={data.url}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={t({
								message: "Edit description",
							})}
							className="absolute right-0 top-0 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-fill-hover hover:text-foreground focus-visible:opacity-100 group-hover/description:opacity-100"
						>
							<LuPencil className="size-3.5" />
						</a>
						{data.body.trim() ? (
							<MarkdownRenderer content={data.body} />
						) : (
							<p className="text-sm italic text-muted-foreground">
								<Trans>No description provided.</Trans>
							</p>
						)}
					</article>
					{children}
				</div>

				<aside className="min-w-0 @3xl:sticky @3xl:top-4 @3xl:self-start">
					<PullRequestChecksSection checks={data.checks} />
				</aside>
			</div>
		</ScrollArea>
	);
}
