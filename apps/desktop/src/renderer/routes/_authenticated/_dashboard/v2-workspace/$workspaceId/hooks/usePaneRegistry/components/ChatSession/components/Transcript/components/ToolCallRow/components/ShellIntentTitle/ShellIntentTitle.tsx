import { Trans } from "@lingui/react/macro";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { cn } from "@superset/ui/utils";
import { FileIcon } from "renderer/lib/fileIcons";
import { useChatPaneActions } from "../../../../../../providers/ChatPaneActionsProvider";
import { isLocalPathText } from "../../../../../../utils/pathText";
import { fileName } from "../../../../utils/fileChange";
import {
	intentLocation,
	type ShellIntent,
} from "../../../../utils/shellIntent";

const CHIP_CLASSNAME =
	"flex min-w-0 max-w-full items-center gap-1 rounded bg-foreground/[0.06] px-1 py-0.5 text-left font-mono text-[13px] text-foreground/70";
const OPENABLE_CLASSNAME =
	"pointer-events-auto cursor-pointer transition-colors hover:bg-foreground/[0.12] hover:text-link-hover";

/**
 * "Read package.json", "Searched useQueue in src": what a shell command did,
 * said the way a native read or search row says it. A file or directory is
 * a chip with its icon that opens it, as a path in prose does; a query is
 * plain. The command itself is in the row's body.
 */
export function ShellIntentTitle({
	intent,
	running,
	verb,
}: {
	intent: ShellIntent;
	running: boolean;
	/** "Read", "Searching": from `toolTitle`, so find matches what is shown. */
	verb: string;
}) {
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
			{intent.verb === "search" ? (
				<>
					<span
						className="min-w-0 truncate font-mono text-[13px] text-foreground/70"
						title={intent.query}
					>
						{intent.query}
					</span>
					{intent.path && (
						<span
							className="min-w-0 truncate text-foreground/40"
							title={intent.path}
						>
							<Trans>in {intent.path}</Trans>
						</span>
					)}
				</>
			) : (
				intent.path && (
					<PathChip
						directory={intent.verb === "list"}
						line={intent.startLine}
						location={intentLocation(intent) ?? intent.path}
						path={intent.path}
					/>
				)
			)}
		</>
	);
}

function PathChip({
	directory,
	line,
	location,
	path,
}: {
	directory: boolean;
	line: number | undefined;
	/** What opens: `path` resolved against where the command ran. */
	location: string;
	path: string;
}) {
	const { openLink } = useChatPaneActions();
	const target = line === undefined ? location : `${location}:${line}`;
	const typed = line === undefined ? path : `${path}:${line}`;
	// An absolute path is mostly the checkout's own prefix; the name is what
	// the row has room for, as on an edit chip. The full path is the tooltip.
	const shown = /^(?:[a-zA-Z]:)?[\\/~]/.test(path)
		? line === undefined
			? fileName(path)
			: `${fileName(path)}:${line}`
		: typed;
	const openable = openLink !== undefined && isLocalPathText(target);
	const icon = (
		<FileIcon
			className="size-3.5 shrink-0"
			fileName={fileName(path)}
			isDirectory={directory}
		/>
	);
	if (!openable) {
		return (
			<span className={CHIP_CLASSNAME} title={target}>
				{icon}
				<span className="min-w-0 truncate">{shown}</span>
			</span>
		);
	}
	return (
		<button
			className={cn(CHIP_CLASSNAME, OPENABLE_CLASSNAME)}
			onClick={(event) => openLink(target, event)}
			title={target}
			type="button"
		>
			{icon}
			<span className="min-w-0 truncate">{shown}</span>
		</button>
	);
}
