import type { SelectAutomationRun } from "@superset/db/schema";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceStrict } from "date-fns";
import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { useNow } from "renderer/hooks/useNow";

const STATUS_DOT: Record<SelectAutomationRun["status"], string> = {
	dispatched: "bg-emerald-500",
	dispatching: "bg-amber-500",
	skipped_offline: "bg-red-500",
	dispatch_failed: "bg-red-500",
};

interface PreviousRunsListProps {
	runs: SelectAutomationRun[];
}

function formatAgo(date: Date, now: Date): string {
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
	if (seconds < 60) return "less than a minute ago";
	return `${formatDistanceStrict(date, now)} ago`;
}

interface ErrorPillProps {
	error: string;
}

function ErrorPill({ error }: ErrorPillProps) {
	// Extract class identifier from "dispatch: ClassName: ..." format
	const classMatch = error.match(/^dispatch: (\w+):/);
	const className = classMatch?.[1] || "Error";

	// Strip the entire "dispatch: ClassName: " prefix before computing preview
	const stripped = error.replace(/^dispatch: \w+: /, "");
	const firstLine = stripped.split("\n")[0];
	const preview = firstLine.slice(0, 80);
	const isTruncated = preview.length < firstLine.length;

	return (
		<span className="inline-flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-xs select-text cursor-text">
			<span className="font-semibold text-red-300">{className}</span>
			<span className="text-red-500/40">·</span>
			<span className="truncate text-red-200/90">
				{preview}
				{isTruncated && " …"}
			</span>
		</span>
	);
}

function ErrorPopoverContent({ error }: ErrorPillProps) {
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(error);
			setCopied(true);
			toast.success("Error copied to clipboard");
			// Reset copied state after 1.6s
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			timeoutRef.current = setTimeout(() => setCopied(false), 1600);
		} catch {
			toast.error("Failed to copy error");
		}
	};

	return (
		<div className="flex flex-col gap-0">
			<div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2">
				<div>
					<div className="text-xs font-semibold text-red-500">run failed</div>
				</div>
				<Button
					size="sm"
					variant="ghost"
					onClick={handleCopy}
					className="h-auto gap-1.5 px-2 py-1 text-xs"
				>
					{copied ? (
						<>
							<Check className="size-3" />
							<span>copied</span>
						</>
					) : (
						<>
							<Copy className="size-3" />
							<span>copy</span>
						</>
					)}
				</Button>
			</div>
			<pre className="flex-1 overflow-y-auto bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words select-text cursor-text max-h-[60vh]">
				{error}
			</pre>
		</div>
	);
}

export function PreviousRunsList({ runs }: PreviousRunsListProps) {
	const navigate = useNavigate();
	const now = useNow();

	if (runs.length === 0) {
		return <p className="text-sm italic text-muted-foreground">No runs yet</p>;
	}

	const handleOpenRun = (run: SelectAutomationRun) => {
		if (!run.v2WorkspaceId) return;
		localStorage.setItem("lastViewedWorkspaceId", run.v2WorkspaceId);
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: run.v2WorkspaceId },
			search: {
				terminalId: run.terminalSessionId ?? undefined,
				chatSessionId: run.chatSessionId ?? undefined,
			},
		});
	};

	return (
		<ul className="flex flex-col gap-0.5 text-sm">
			{runs.map((run) => {
				const clickable = !!run.v2WorkspaceId;
				const error = run.error;

				const row = (
					<button
						type="button"
						disabled={!clickable && !error}
						onClick={() => handleOpenRun(run)}
						className={cn(
							"group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
							clickable || error
								? "cursor-pointer hover:bg-accent/40"
								: "cursor-default opacity-70",
						)}
					>
						<span
							role="img"
							aria-label={run.status}
							className={cn(
								"inline-block size-2 shrink-0 rounded-full",
								STATUS_DOT[run.status],
							)}
						/>
						<span className="truncate">{run.title || "Automation"}</span>
						{error && <ErrorPill error={error} />}
						<span className="ml-auto shrink-0 truncate text-muted-foreground">
							{run.scheduledFor
								? formatAgo(new Date(run.scheduledFor), now)
								: "—"}
						</span>
						{error && <ErrorRowCopyButton error={error} />}
					</button>
				);

				return (
					<li key={run.id}>
						{error ? (
							<Popover>
								<PopoverTrigger asChild>{row}</PopoverTrigger>
								<PopoverContent className="w-[560px] max-w-[92vw] p-0">
									<ErrorPopoverContent error={error} />
								</PopoverContent>
							</Popover>
						) : (
							row
						)}
					</li>
				);
			})}
		</ul>
	);
}

interface ErrorRowCopyButtonProps {
	error: string;
}

function ErrorRowCopyButton({ error }: ErrorRowCopyButtonProps) {
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleCopy = async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(error);
			setCopied(true);
			toast.success("Error copied to clipboard");
			// Reset copied state after 1.6s
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			timeoutRef.current = setTimeout(() => setCopied(false), 1600);
		} catch {
			toast.error("Failed to copy error");
		}
	};

	return (
		<Button
			size="icon"
			variant="ghost"
			className="size-6 shrink-0 rounded-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
			onClick={handleCopy}
			aria-label="Copy error"
		>
			{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
		</Button>
	);
}
