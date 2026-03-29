import type { PullRequestComment } from "@superset/local-db";
import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { buildAllCommentsClipboardText } from "renderer/screens/main/components/WorkspaceView/RightSidebar/ChangesView/components/ReviewPanel/utils";

export interface UseReviewActionsProps {
	comments: PullRequestComment[];
	onSendToAgent?: (text: string) => void;
}

export interface UseReviewActionsReturn {
	handleCopyAll: () => void;
	handleSendToAgent: () => void;
	copiedAll: boolean;
	isCopying: boolean;
}

/**
 * Hook for managing review pane actions (copy/send).
 * Handles copying formatted markdown to clipboard and sending to chat agent.
 */
export function useReviewActions({
	comments,
	onSendToAgent,
}: UseReviewActionsProps): UseReviewActionsReturn {
	const [copiedAll, setCopiedAll] = useState(false);
	const copiedResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	const copyToClipboardMutation = electronTrpc.external.copyText.useMutation();

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (copiedResetTimeoutRef.current) {
				clearTimeout(copiedResetTimeoutRef.current);
			}
		};
	}, []);

	const handleCopyAll = useCallback(() => {
		const text = buildAllCommentsClipboardText(comments);

		copyToClipboardMutation.mutate(text, {
			onSuccess: () => {
				if (copiedResetTimeoutRef.current) {
					clearTimeout(copiedResetTimeoutRef.current);
				}

				setCopiedAll(true);
				copiedResetTimeoutRef.current = setTimeout(() => {
					setCopiedAll(false);
					copiedResetTimeoutRef.current = null;
				}, 1500);
			},
			onError: (error) => {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				toast.error(`Failed to copy comments: ${message}`);
			},
		});
	}, [comments, copyToClipboardMutation]);

	const handleSendToAgent = useCallback(() => {
		const text = buildAllCommentsClipboardText(comments);
		onSendToAgent?.(text);
	}, [comments, onSendToAgent]);

	return {
		handleCopyAll,
		handleSendToAgent,
		copiedAll,
		isCopying: copyToClipboardMutation.isPending,
	};
}
