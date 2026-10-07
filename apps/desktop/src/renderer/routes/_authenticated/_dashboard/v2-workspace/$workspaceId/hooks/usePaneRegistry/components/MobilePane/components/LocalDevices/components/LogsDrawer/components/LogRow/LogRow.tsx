import { cn } from "@superset/ui/utils";
import type { LogEntry } from "../../utils/parseLogLine";

export function LogRow({ entry }: { entry: LogEntry }) {
	return (
		<div
			data-log-row
			className="grid h-6 grid-cols-[88px_128px_1fr] items-center gap-3 px-3 font-mono text-xs hover:bg-accent/50"
		>
			<span className="truncate text-muted-foreground/70">{entry.time}</span>
			<span className="truncate text-muted-foreground">{entry.process}</span>
			<span
				className={cn(
					"truncate",
					(entry.level === "error" || entry.level === "fault") &&
						"text-destructive",
				)}
				title={entry.message}
			>
				{entry.message}
			</span>
		</div>
	);
}
