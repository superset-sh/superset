import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LuLoaderCircle } from "react-icons/lu";
import { CommentMarkdown } from "renderer/components/CommentMarkdown";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { CommentThread } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/DiffPane/components/CommentThread";

interface PRReviewPanelProps {
	hostUrl: string;
	projectId: string;
	prNumber: number;
}

export function PRReviewPanel({
	hostUrl,
	projectId,
	prNumber,
}: PRReviewPanelProps) {
	const queryClient = useQueryClient();
	const queryKey = ["pull-request-threads", projectId, hostUrl, prNumber];
	const { data, isLoading, error } = useQuery({
		queryKey,
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl).pullRequests.getThreads.query({
				projectId,
				prNumber,
			}),
		staleTime: 30_000,
		gcTime: 10 * 60_000,
		retry: false,
	});

	const setResolution = useMutation({
		mutationFn: (input: { threadId: string; resolved: boolean }) =>
			getHostServiceClientByUrl(
				hostUrl,
			).pullRequests.setThreadResolution.mutate(input),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey });
		},
	});

	if (isLoading) {
		return (
			<div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
				<LuLoaderCircle className="size-4 animate-spin" />
				<span className="text-sm">Loading review comments…</span>
			</div>
		);
	}

	if (error instanceof Error) {
		return (
			<div className="p-4 text-sm text-destructive select-text cursor-text">
				{error.message}
			</div>
		);
	}

	const reviewThreads = data?.reviewThreads ?? [];
	const conversationComments = data?.conversationComments ?? [];

	if (reviewThreads.length === 0 && conversationComments.length === 0) {
		return (
			<div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
				No review comments yet.
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6 p-4 @md:p-6">
			{reviewThreads.length > 0 && (
				<section className="flex flex-col gap-2">
					<h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Review comments
					</h2>
					<div className="-mx-3 flex flex-col">
						{reviewThreads.map((thread) => (
							<CommentThread
								key={thread.id}
								isResolved={thread.isResolved}
								isOutdated={thread.isOutdated}
								comments={thread.comments.map((comment) => ({
									id: comment.id,
									authorLogin: comment.author.login,
									avatarUrl: comment.author.avatarUrl,
									body: comment.body,
									createdAt: new Date(comment.createdAt).getTime(),
								}))}
								onToggleResolve={(resolved) =>
									setResolution.mutate({ threadId: thread.id, resolved })
								}
								isResolving={
									setResolution.isPending &&
									setResolution.variables?.threadId === thread.id
								}
							/>
						))}
					</div>
				</section>
			)}
			{conversationComments.length > 0 && (
				<section className="flex flex-col gap-2">
					<h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Comments
					</h2>
					<ul className="divide-y divide-border rounded-md border border-border">
						{conversationComments.map((comment) => (
							<li key={comment.id} className="flex gap-2 px-3 py-2.5">
								<Avatar className="mt-0.5 size-5 shrink-0">
									<AvatarImage
										src={comment.user.avatarUrl}
										alt={comment.user.login}
									/>
									<AvatarFallback className="text-[10px]">
										{comment.user.login.slice(0, 1).toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<div className="min-w-0 flex-1">
									<div className="flex items-baseline gap-2 text-xs">
										<a
											href={comment.htmlUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="font-medium text-foreground hover:underline"
										>
											{comment.user.login}
										</a>
										<time className="text-muted-foreground">
											{formatRelativeTime(
												new Date(comment.createdAt).getTime(),
											)}{" "}
											ago
										</time>
									</div>
									<div className="mt-1">
										<CommentMarkdown body={comment.body} />
									</div>
								</div>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
