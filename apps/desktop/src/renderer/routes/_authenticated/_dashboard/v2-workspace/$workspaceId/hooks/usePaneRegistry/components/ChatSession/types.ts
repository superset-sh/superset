/**
 * Where a branched conversation continues. Lives with the chat views rather
 * than with the hook that performs the fork: the views offer the choice, and
 * only one of the two surfaces knows how to carry it out.
 */
export type ChatForkTarget = "workspace" | "worktree";

/** A rewind picked in the chat: the message to go back before, and the conversation up to it. */
export type ChatRewindRequest = {
	itemId: string;
	messageText: string;
	transcript: string;
};
