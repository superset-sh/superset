import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { DiffStatText } from "../../../../../../../../../../../../components/DiffStatText";
import { useChatPaneActions } from "../../../../../../../../providers/ChatPaneActionsProvider";
import { CopyButton } from "../../../../../../../CopyButton";
import type { DiffStats } from "../../../../../../utils/diffStats";
import { fileName } from "../../../../../../utils/fileChange";
import { TruncateStart } from "./components/TruncateStart";

function directoryOf(path: string, name: string): string {
	return path.slice(0, path.length - name.length).replace(/[\\/]+$/, "");
}

/**
 * The line that stays in view while the diff scrolls under it: the file by
 * name, where it lives, a copy of its path, and what the change cost.
 */
export function DiffCardHeader({
	path,
	stats,
}: {
	path: string;
	stats: DiffStats | null;
}) {
	const { t } = useLingui();
	const { openFile } = useChatPaneActions();
	const name = fileName(path);
	const directory = directoryOf(path, name);
	const nameClassName = "shrink-0 font-medium font-mono text-foreground";
	return (
		<div className="sticky top-0 z-10 flex items-center gap-2 border-border/60 border-b bg-background/95 py-1.5 pr-2 pl-3 text-xs backdrop-blur-sm">
			<span className="flex min-w-0 flex-1 items-center gap-1.5">
				{openFile ? (
					<button
						className={cn(nameClassName, "cursor-pointer hover:underline")}
						onClick={() => openFile(path)}
						title={path}
						type="button"
					>
						{name}
					</button>
				) : (
					<span className={nameClassName} title={path}>
						{name}
					</span>
				)}
				{directory && (
					<TruncateStart
						className="font-mono text-muted-foreground/60"
						title={path}
					>
						{directory}
					</TruncateStart>
				)}
				<CopyButton
					className="shrink-0 p-0.5"
					iconClassName="size-3"
					label={t({ message: "Copy path" })}
					text={path}
				/>
			</span>
			{stats && (
				<span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums">
					<DiffStatText
						additions={stats.additions}
						deletions={stats.deletions}
					/>
				</span>
			)}
		</div>
	);
}
