import { useMemo } from "react";
import { isDesktopChatDevMode } from "renderer/lib/dev-chat";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useOptimisticCollectionMutation } from "../useOptimisticCollectionMutation";

export function useChatSessionOptimisticActions() {
	const collections = useCollections();
	const runMutation = useOptimisticCollectionMutation(
		"useChatSessionOptimisticActions",
	);

	return useMemo(
		() => ({
			deleteSession: (sessionId: string) => {
				if (isDesktopChatDevMode()) return null;

				return runMutation("Failed to delete chat session", () =>
					collections.chatSessions.delete(sessionId),
				);
			},
		}),
		[collections, runMutation],
	);
}
