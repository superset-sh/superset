import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { AlertTriangle } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
	type TerminalLogEntry,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";

interface TerminalLogsButtonProps {
	terminalId: string;
	terminalInstanceId: string;
}

export function TerminalLogsButton({
	terminalId,
	terminalInstanceId,
}: TerminalLogsButtonProps) {
	const subscribe = useCallback(
		(cb: () => void) =>
			terminalRuntimeRegistry.onLogsChange(terminalId, cb, terminalInstanceId),
		[terminalId, terminalInstanceId],
	);
	const getSnapshot = useCallback(
		() => terminalRuntimeRegistry.getLogs(terminalId, terminalInstanceId),
		[terminalId, terminalInstanceId],
	);
	const logs = useSyncExternalStore(subscribe, getSnapshot);
	const [open, setOpen] = useState(false);

	if (logs.length === 0) return null;

	const hasError = logs.some((entry) => entry.level === "error");

	const handleClear = (event: React.MouseEvent) => {
		event.stopPropagation();
		terminalRuntimeRegistry.clearLogs(terminalId, terminalInstanceId);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={`View terminal connection log (${logs.length} ${logs.length === 1 ? "event" : "events"})`}
							onClick={(event) => event.stopPropagation()}
							className={cn(
								"rounded p-1 transition-colors",
								hasError
									? "text-destructive/70 hover:text-destructive"
									: "text-amber-500/70 hover:text-amber-500",
							)}
						>
							<AlertTriangle className="size-3.5" />
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{logs.length} connection {logs.length === 1 ? "event" : "events"}
				</TooltipContent>
			</Tooltip>
			<PopoverContent
				align="end"
				className="w-96 p-0"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-center justify-between border-b border-border px-3 py-2">
					<div className="text-xs font-medium text-foreground">
						Connection log
					</div>
					<button
						type="button"
						onClick={handleClear}
						className="rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						Clear
					</button>
				</div>
				<div className="max-h-72 overflow-y-auto">
					<ul className="divide-y divide-border">
						{[...logs].reverse().map((entry) => (
							<LogRow key={entry.id} entry={entry} />
						))}
					</ul>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function LogRow({ entry }: { entry: TerminalLogEntry }) {
	return (
		<li className="min-w-0 px-3 py-2 text-xs">
			<div className="flex items-baseline gap-2">
				<span
					className={cn(
						"shrink-0 font-mono uppercase tracking-wider",
						entry.level === "error" && "text-destructive",
						entry.level === "warn" && "text-amber-500",
						entry.level === "info" && "text-muted-foreground",
					)}
				>
					{entry.level}
				</span>
				<time className="shrink-0 font-mono text-muted-foreground">
					{formatTime(entry.timestamp)}
				</time>
			</div>
			<p className="mt-1 wrap-anywhere text-foreground">{entry.message}</p>
		</li>
	);
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString(undefined, {
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}
