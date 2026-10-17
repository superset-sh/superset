import { createContext, useContext } from "react";
import type { PullRequestCommentTarget } from "../../components/PullRequestConversationComposer";

const PullRequestActivityReplyContext =
	createContext<PullRequestCommentTarget | null>(null);

export const PullRequestActivityReplyProvider =
	PullRequestActivityReplyContext.Provider;

/**
 * Where a reply opened under a card posts. Null where nothing can take one
 * (the cloud route, an older host); a card's Reply is then a link to GitHub.
 */
export function usePullRequestActivityReply(): PullRequestCommentTarget | null {
	return useContext(PullRequestActivityReplyContext);
}
