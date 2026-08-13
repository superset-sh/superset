import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/lib/utils";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { LuSquareTerminal, LuThumbsDown } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { type FactoryRun, STAGE_LABELS } from "../../../../constants";

interface FactoryRunEntryProps {
	run: FactoryRun;
	onOpenWorkspace: () => void;
}

function statusBadge(run: FactoryRun): { label: string; className: string } {
	if (run.status === "dispatch_failed")
		return {
			label: "dispatch failed",
			className: "bg-red-500/15 text-red-600 dark:text-red-400",
		};
	if (run.status === "skipped_offline")
		return {
			label: "host offline",
			className: "bg-red-500/15 text-red-600 dark:text-red-400",
		};
	if (run.status !== "reported")
		return {
			label: "running",
			className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
		};
	switch (run.outcome) {
		case "success":
			return {
				label: "success",
				className: "bg-green-500/15 text-green-600 dark:text-green-400",
			};
		case "blocked":
			return {
				label: "blocked",
				className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
			};
		case "flawed":
			return {
				label: "flawed",
				className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
			};
		default:
			return {
				label: run.outcome ?? "reported",
				className: "bg-fill-secondary text-muted-foreground",
			};
	}
}

export function FactoryRunEntry({
	run,
	onOpenWorkspace,
}: FactoryRunEntryProps) {
	const utils = cloudTrpc.useUtils();
	const [noteOpen, setNoteOpen] = useState(false);
	const [note, setNote] = useState("");
	const badge = statusBadge(run);

	const setFeedback = useMutation({
		mutationFn: (input: { feedbackNote?: string }) =>
			apiTrpcClient.factory.setRunFeedback.mutate({
				runId: run.id,
				outcome: "flawed",
				feedbackNote: input.feedbackNote,
			}),
		onSuccess: () => {
			setNoteOpen(false);
			setNote("");
			void utils.factory.getItem.invalidate();
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<div className="flex flex-col gap-1.5 rounded-md border border-border p-2.5">
			<div className="flex items-center gap-2">
				<span className="text-xs font-medium">
					{STAGE_LABELS[run.stage]}
					{run.attempt > 1 ? ` · attempt ${run.attempt}` : ""}
				</span>
				<span
					className={cn(
						"rounded px-1.5 py-px text-[10px] font-medium",
						badge.className,
					)}
				>
					{badge.label}
				</span>
				<span className="flex-1" />
				{run.v2WorkspaceId && (
					<Button
						size="sm"
						variant="ghost"
						className="h-5 gap-1 px-1.5 text-[11px]"
						onClick={onOpenWorkspace}
					>
						<LuSquareTerminal className="size-3" />
						Open
					</Button>
				)}
				{run.status === "reported" && run.outcome !== "flawed" && (
					<Button
						size="sm"
						variant="ghost"
						aria-label="Mark run flawed"
						className="h-5 px-1.5 text-[11px]"
						onClick={() => setNoteOpen((open) => !open)}
					>
						<LuThumbsDown className="size-3" />
					</Button>
				)}
			</div>
			{run.rationale && (
				<p className="select-text cursor-text text-xs text-muted-foreground">
					{run.rationale}
				</p>
			)}
			{run.error && (
				<p className="select-text cursor-text text-xs text-red-600 dark:text-red-400">
					{run.error}
				</p>
			)}
			{run.feedbackNote && (
				<p className="select-text cursor-text text-xs text-amber-700 dark:text-amber-400">
					Feedback: {run.feedbackNote}
				</p>
			)}
			{run.resultJson != null && (
				<pre className="select-text cursor-text overflow-x-auto rounded bg-fill-secondary/60 p-2 text-[11px] leading-snug">
					{JSON.stringify(run.resultJson, null, 2)}
				</pre>
			)}
			{noteOpen && (
				<div className="flex items-center gap-2">
					<input
						value={note}
						onChange={(event) => setNote(event.target.value)}
						placeholder="What was wrong? (feeds prompt improvement)"
						className="h-6 flex-1 rounded border border-border bg-background px-2 text-xs"
					/>
					<Button
						size="sm"
						className="h-6 px-2 text-[11px]"
						disabled={setFeedback.isPending}
						onClick={() =>
							setFeedback.mutate({ feedbackNote: note || undefined })
						}
					>
						Mark flawed
					</Button>
				</div>
			)}
		</div>
	);
}
