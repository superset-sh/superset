import { normalizePRState } from "renderer/screens/main/components/PRIcon";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";
import { PullRequestStateGlyph } from "../PullRequestStateGlyph";

interface PullRequestTabTitleProps {
	data: Pick<PullRequestDetail, "title" | "state" | "isDraft" | "mergeability">;
}

/** The one-line title the Changes tab keeps above its content. */
export function PullRequestTabTitle({ data }: PullRequestTabTitleProps) {
	const state =
		data.state === "open" &&
		!data.isDraft &&
		data.mergeability === "conflicting"
			? "conflicting"
			: normalizePRState(data.state, data.isDraft);
	return (
		<div className="flex shrink-0 items-center gap-2 px-6 pb-2 pt-1 @max-[36rem]/detail:px-4">
			<PullRequestStateGlyph state={state} className="size-4" />
			<h1
				className="m-0 min-w-0 truncate text-sm font-medium"
				title={data.title}
			>
				{data.title}
			</h1>
		</div>
	);
}
