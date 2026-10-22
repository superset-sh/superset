import { Diffstat } from "../../../components/Diffstat";
import { usePullRequestDiffstat } from "../../../hooks/usePullRequestDiffstat";
import type { WorkspacePullRequest } from "../../../hooks/useWorkspacePullRequest";

/** Renders nothing until the numbers exist: a placeholder would be a third thing on the row. */
export function RowDiffstat({
	pullRequest,
	enabled,
}: {
	pullRequest: WorkspacePullRequest;
	/** The sheet caps how many rows fetch, so an old long history cannot fan
	 * out one GitHub call per row the moment the sheet opens. */
	enabled: boolean;
}) {
	const diffstat = usePullRequestDiffstat({ pullRequest, enabled });
	return diffstat ? <Diffstat {...diffstat} /> : null;
}
