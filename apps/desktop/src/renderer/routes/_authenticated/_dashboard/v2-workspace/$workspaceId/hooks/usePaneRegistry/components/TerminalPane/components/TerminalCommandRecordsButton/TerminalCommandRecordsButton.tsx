import type { TerminalCommandRecord } from "@superset/shared/terminal-command-record";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	CheckCircle2,
	CircleHelp,
	Copy,
	History,
	Loader2,
	RotateCcw,
	XCircle,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useState,
	useSyncExternalStore,
} from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";

interface TerminalCommandRecordsButtonProps {
	terminalId: string;
	terminalInstanceId: string;
	workspaceId: string;
}

export function TerminalCommandRecordsButton({
	terminalId,
	terminalInstanceId,
	workspaceId,
}: TerminalCommandRecordsButtonProps) {
	const subscribe = useCallback(
		(cb: () => void) =>
			terminalRuntimeRegistry.onCommandRecordsChange(
				terminalId,
				cb,
				terminalInstanceId,
			),
		[terminalId, terminalInstanceId],
	);
	const getSnapshot = useCallback(
		() =>
			terminalRuntimeRegistry.getCommandRecords(terminalId, terminalInstanceId),
		[terminalId, terminalInstanceId],
	);
	const records = useSyncExternalStore(subscribe, getSnapshot);
	const [open, setOpen] = useState(false);

	if (records.length === 0) return null;

	const latest = records[records.length - 1];
	const failedCount = records.filter(
		(record) => record.status === "failed",
	).length;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={`View command history (${records.length} ${records.length === 1 ? "command" : "commands"})`}
							onClick={(event) => event.stopPropagation()}
							className={cn(
								"flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors",
								failedCount > 0
									? "text-destructive/75 hover:text-destructive"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<History className="size-3.5" />
							<span className="font-mono tabular-nums">{records.length}</span>
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{latest?.status === "running" ? "Command running" : "Command history"}
				</TooltipContent>
			</Tooltip>
			<PopoverContent
				align="end"
				className="w-[28rem] p-0"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-center justify-between border-b border-border px-3 py-2">
					<div className="text-xs font-medium text-foreground">
						Command history
					</div>
					<div className="font-mono text-[11px] text-muted-foreground">
						{records.length}
					</div>
				</div>
				<div className="max-h-96 overflow-y-auto">
					<ul className="divide-y divide-border">
						{[...records].reverse().map((record) => (
							<CommandRecordRow
								key={record.id}
								record={record}
								workspaceId={workspaceId}
								terminalId={terminalId}
								terminalInstanceId={terminalInstanceId}
							/>
						))}
					</ul>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function CommandRecordRow({
	record,
	workspaceId,
	terminalId,
	terminalInstanceId,
}: {
	record: TerminalCommandRecord;
	workspaceId: string;
	terminalId: string;
	terminalInstanceId: string;
}) {
	const { copyToClipboard } = useCopyToClipboard();
	const trpcUtils = workspaceTrpc.useUtils();
	const commandLabel = record.command || "Interactive command";
	const canCopyOutput = Boolean(record.outputHead || record.outputTail);

	const handleCopyCommand = () => {
		if (!record.command) return;
		void copyToClipboard(record.command);
	};

	const handleCopyOutput = () => {
		if (!canCopyOutput) return;
		void trpcUtils.terminal.getCommandRecord
			.fetch({
				workspaceId,
				terminalId,
				recordId: record.id,
			})
			.then(({ record: fullRecord }) =>
				copyToClipboard(formatOutputSummary(fullRecord ?? record)),
			)
			.catch(() => copyToClipboard(formatOutputSummary(record)));
	};

	const handleRerun = () => {
		if (!record.command) return;
		terminalRuntimeRegistry.runCommand(
			terminalId,
			record.command,
			terminalInstanceId,
			{ source: "system" },
		);
	};

	return (
		<li className="min-w-0 px-3 py-2 text-xs">
			<div className="flex min-w-0 items-start gap-2">
				<StatusIcon record={record} />
				<div className="min-w-0 flex-1">
					<div
						className="truncate font-mono text-foreground"
						title={commandLabel}
					>
						{commandLabel}
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
						<span>{record.source}</span>
						<span>{formatExit(record)}</span>
						<span>{formatDuration(record)}</span>
						{record.truncatedLineCount > 0 && (
							<span>{record.truncatedLineCount} truncated</span>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-0.5">
					<IconButton
						label="Copy command"
						disabled={!record.command}
						onClick={handleCopyCommand}
					>
						<Copy className="size-3.5" />
					</IconButton>
					<IconButton
						label="Copy output summary"
						disabled={!canCopyOutput}
						onClick={handleCopyOutput}
					>
						<Copy className="size-3.5" />
					</IconButton>
					<IconButton
						label="Rerun command"
						disabled={!record.command}
						onClick={handleRerun}
					>
						<RotateCcw className="size-3.5" />
					</IconButton>
				</div>
			</div>
		</li>
	);
}

function IconButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string;
	disabled?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					disabled={disabled}
					onClick={onClick}
					className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

function StatusIcon({ record }: { record: TerminalCommandRecord }) {
	if (record.status === "running") {
		return (
			<Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-sky-500" />
		);
	}
	if (record.status === "succeeded") {
		return (
			<CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
		);
	}
	if (record.status === "failed") {
		return <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
	}
	return (
		<CircleHelp className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
	);
}

function formatExit(record: TerminalCommandRecord): string {
	if (record.status === "running") return "running";
	if (record.exitCode === null) return record.status;
	return `exit ${record.exitCode}`;
}

function formatDuration(record: TerminalCommandRecord): string {
	const end = record.endedAt ?? Date.now();
	const durationMs = Math.max(0, end - record.startedAt);
	if (durationMs < 1000) return `${durationMs}ms`;
	return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

function formatOutputSummary(record: TerminalCommandRecord): string {
	if (!record.outputTail) return record.outputHead;
	return `${record.outputHead}\n\n...\n\n${record.outputTail}`;
}
