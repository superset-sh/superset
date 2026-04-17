import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { HiPaperAirplane } from "react-icons/hi2";
import { LuExternalLink } from "react-icons/lu";
import { VscChevronRight, VscIssues } from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";

function stateColor(state: string): string {
	return state === "Open"
		? "text-green-500"
		: state === "In Progress"
			? "text-blue-500"
			: state === "In Review"
				? "text-yellow-500"
				: "text-muted-foreground";
}

interface LinkedIssueViewProps {
	onedevIssueId: number;
	onedevIssueNumber: number;
	onedevProjectPath: string;
}

export function LinkedIssueView({
	onedevIssueId,
	onedevIssueNumber,
	onedevProjectPath,
}: LinkedIssueViewProps) {
	const utils = electronTrpc.useUtils();

	const { data: onedevConfig } =
		electronTrpc.settings.getOnedevConfig.useQuery();
	const { data: issue, isLoading } =
		electronTrpc.settings.getOnedevIssue.useQuery(
			{ projectPath: onedevProjectPath, issueNumber: onedevIssueNumber },
			{ refetchInterval: 15_000 },
		);
	const { data: comments = [] } =
		electronTrpc.settings.getOnedevIssueComments.useQuery(
			{ issueId: onedevIssueId },
			{ enabled: !!onedevIssueId, refetchInterval: 15_000 },
		);

	const updateState = electronTrpc.settings.updateOnedevIssueState.useMutation({
		onSuccess: () => {
			utils.settings.getOnedevIssue.invalidate();
			utils.settings.getOnedevIssues.invalidate();
		},
		onError: (err: unknown) =>
			toast.error(err instanceof Error ? err.message : "Error"),
	});

	const addComment = electronTrpc.settings.createOnedevIssueComment.useMutation(
		{
			onSuccess: () => {
				utils.settings.getOnedevIssueComments.invalidate();
				setCommentDraft("");
			},
			onError: (err: unknown) =>
				toast.error(err instanceof Error ? err.message : "Error"),
		},
	);

	const [commentDraft, setCommentDraft] = useState("");
	const [descOpen, setDescOpen] = useState(false);

	if (isLoading) {
		return (
			<div className="flex flex-col flex-1 min-h-0 p-3 space-y-2">
				<Skeleton className="h-5 w-24 rounded-sm" />
				<Skeleton className="h-4 w-full rounded-sm" />
				<Skeleton className="h-4 w-3/4 rounded-sm" />
				<Skeleton className="h-20 w-full rounded-sm" />
			</div>
		);
	}

	if (!issue) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				Issue not found
			</div>
		);
	}

	const slug = issue.projectKey
		? `${issue.projectKey.toLowerCase()}-${issue.number}`
		: `#${issue.number}`;
	const onedevUrl = onedevConfig?.url ?? "";
	const externalUrl = onedevUrl
		? `${onedevUrl}/${onedevProjectPath}/~issues/${issue.number}`
		: "";

	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
				<div className="flex items-center gap-2 min-w-0">
					<VscIssues
						className={`size-3.5 shrink-0 ${stateColor(issue.state)}`}
					/>
					<span className="text-xs font-mono text-muted-foreground truncate">
						{String(slug)}
					</span>
				</div>
				{externalUrl && (
					<a
						href={externalUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
					>
						<LuExternalLink className="size-3.5" />
					</a>
				)}
			</div>

			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto min-h-0">
				{/* Title */}
				<div className="px-3 py-2.5 border-b border-border">
					<h3 className="text-sm font-semibold">{String(issue.title)}</h3>
				</div>

				{/* Properties */}
				<div className="px-3 py-2.5 border-b border-border flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<span className="text-xs text-muted-foreground">State</span>
						<select
							value={issue.state}
							onChange={(e) =>
								updateState.mutate({
									issueId: issue.id,
									state: e.target.value,
								})
							}
							className="h-6 text-xs rounded border bg-transparent px-1 w-28"
						>
							<option value="Open">Open</option>
							<option value="In Progress">In Progress</option>
							<option value="In Review">In Review</option>
							<option value="Closed">Closed</option>
						</select>
					</div>
					{issue.fields?.Type && (
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">Type</span>
							<span className="text-xs">{String(issue.fields.Type)}</span>
						</div>
					)}
					{issue.fields?.Priority && (
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">Priority</span>
							<span className="text-xs">{String(issue.fields.Priority)}</span>
						</div>
					)}
				</div>

				{/* Description (collapsible) */}
				{issue.description && (
					<div className="border-b border-border">
						<Collapsible open={descOpen} onOpenChange={setDescOpen}>
							<CollapsibleTrigger className="flex items-center gap-1.5 px-3 py-2 w-full hover:bg-accent/30 cursor-pointer transition-colors">
								<VscChevronRight
									className={cn(
										"size-3 text-muted-foreground shrink-0 transition-transform duration-150",
										descOpen && "rotate-90",
									)}
								/>
								<span className="text-xs font-medium">Description</span>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<p className="px-3 pb-2.5 text-xs text-muted-foreground whitespace-pre-wrap break-words">
									{String(issue.description)}
								</p>
							</CollapsibleContent>
						</Collapsible>
					</div>
				)}

				{/* Comments */}
				<div className="px-3 py-2.5">
					<h4 className="text-xs font-medium text-muted-foreground mb-2">
						Activity
					</h4>

					<div className="flex items-start gap-2 mb-2">
						<div className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5">
							S
						</div>
						<span className="text-xs text-muted-foreground">
							{"Created · "}
							{new Date(issue.submitDate).toLocaleDateString("de-DE")}
						</span>
					</div>

					{comments.map(
						(comment: { id: number; content: string; date: string }) => (
							<div key={comment.id} className="flex items-start gap-2 mb-2">
								<div className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5">
									C
								</div>
								<div className="min-w-0">
									<span className="text-xs text-muted-foreground">
										{new Date(comment.date).toLocaleDateString("de-DE")}
									</span>
									<p className="text-xs mt-0.5 whitespace-pre-wrap break-words">
										{String(comment.content)}
									</p>
								</div>
							</div>
						),
					)}
				</div>
			</div>

			{/* Comment input */}
			<div className="border-t border-border px-3 py-2 shrink-0 flex gap-2">
				<textarea
					value={commentDraft}
					onChange={(e) => {
						setCommentDraft(e.target.value);
						e.target.style.height = "auto";
						e.target.style.height = `${e.target.scrollHeight}px`;
					}}
					placeholder="Write a comment..."
					rows={1}
					className="flex-1 resize-none text-xs bg-transparent border rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary max-h-48"
					onKeyDown={(e) => {
						if (
							e.key === "Enter" &&
							(e.metaKey || e.ctrlKey) &&
							commentDraft.trim()
						) {
							addComment.mutate({
								issueId: onedevIssueId,
								content: commentDraft.trim(),
							});
						}
					}}
				/>
				<Button
					size="icon"
					className="h-7 w-7 shrink-0"
					disabled={!commentDraft.trim() || addComment.isPending}
					onClick={() =>
						addComment.mutate({
							issueId: onedevIssueId,
							content: commentDraft.trim(),
						})
					}
				>
					<HiPaperAirplane className="size-3" />
				</Button>
			</div>
		</div>
	);
}
