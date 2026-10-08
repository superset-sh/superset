import { useLingui } from "@lingui/react/macro";
import type { ToolCall } from "@superset/chat/protocol";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { useMemo } from "react";
import { DiffStatText } from "../../../../../../../../../../components/DiffStatText";
import { diffStats } from "../../../../utils/diffStats";
import type { FileChange } from "../../../../utils/fileChange";

/**
 * "Edited README.md +5 −1": the verb says what happened and whether it is
 * still happening, the name is what a row has room for, the tally is what it
 * cost. The agent's own title ("Write /full/path") says the same thing worse.
 */
export function FileChangeTitle({
	change,
	item,
	running,
}: {
	change: FileChange;
	item: ToolCall;
	running: boolean;
}) {
	const { t } = useLingui();
	const stats = useMemo(() => {
		const diff = item.content.find((content) => content.type === "diff");
		return diff && diff.type === "diff" ? diffStats(diff) : null;
	}, [item.content]);
	const verb = running
		? change.kind === "added"
			? t({ message: "Creating", context: "file change" })
			: change.kind === "deleted"
				? t({ message: "Deleting", context: "file change" })
				: t({ message: "Editing", context: "file change" })
		: change.kind === "added"
			? t({ message: "Created", context: "file change" })
			: change.kind === "deleted"
				? t({ message: "Deleted", context: "file change" })
				: t({ message: "Edited", context: "file change" });
	return (
		<>
			<span className="shrink-0">
				{running ? (
					<ShimmerLabel className="font-normal" duration={1.6}>
						{verb}
					</ShimmerLabel>
				) : (
					verb
				)}
			</span>
			<span
				className="min-w-0 truncate rounded bg-foreground/[0.06] px-1 py-0.5 font-mono text-[13px] text-foreground/70"
				title={change.path}
			>
				{change.name}
			</span>
			{stats && !running && (
				<span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums">
					<DiffStatText
						additions={change.kind === "deleted" ? 0 : stats.additions}
						deletions={change.kind === "added" ? 0 : stats.deletions}
					/>
				</span>
			)}
		</>
	);
}
