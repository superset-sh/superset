import { Trans } from "@lingui/react/macro";
import type { ChatTransport } from "@superset/chat/client";
import { Button } from "@superset/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function StoppedAccountQueue({
	hostUrl,
	sessionId,
	transport,
	allowRegisteredDead = false,
}: {
	hostUrl: string;
	sessionId: string;
	allowRegisteredDead?: boolean;
	transport: {
		getQueue: ChatTransport["getQueue"];
		removeQueuedPrompt: (
			input: Parameters<ChatTransport["removeQueuedPrompt"]>[0],
		) => Promise<unknown>;
	};
}) {
	const queryClient = useQueryClient();
	const queryKey = ["stopped-account-queue", hostUrl, sessionId];
	const queue = useQuery({
		queryKey,
		queryFn: () => transport.getQueue({ sessionId }),
		retry: false,
	});
	const discard = useMutation({
		mutationFn: (itemId: string) =>
			transport.removeQueuedPrompt({
				sessionId,
				itemId,
				commandId: crypto.randomUUID(),
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey }),
	});
	if (queue.isPending)
		return (
			<p>
				<Trans>Loading…</Trans>
			</p>
		);
	if (queue.isError)
		return (
			<p role="alert">
				<Trans>Could not read queued messages.</Trans>
			</p>
		);
	if (
		(queue.data.live && !allowRegisteredDead) ||
		queue.data.prompts.length === 0
	)
		return null;
	return (
		<div className="w-full max-w-lg space-y-2 text-left text-xs">
			<p>
				<Trans>
					These messages were not sent. Copy anything you need, then discard the
					queue before resuming.
				</Trans>
			</p>
			<ul className="max-h-56 space-y-2 overflow-y-auto">
				{queue.data.prompts.map((prompt) => (
					<li key={prompt.itemId} className="space-y-2 rounded-md border p-3">
						{prompt.content.map((content, index) => (
							<p
								key={`${prompt.itemId}:${index}`}
								className="whitespace-pre-wrap break-words select-text"
							>
								{content.type === "text" ? content.text : content.name}
							</p>
						))}
						<Button
							size="sm"
							variant="outline"
							disabled={discard.isPending}
							onClick={() => discard.mutate(prompt.itemId)}
						>
							<Trans>Discard queued message</Trans>
						</Button>
					</li>
				))}
			</ul>
			{discard.isError && (
				<p role="alert">
					<Trans>Could not discard the queued message.</Trans>
				</p>
			)}
		</div>
	);
}
