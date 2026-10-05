/**
 * Where a branched conversation continues. Lives with the chat views rather
 * than with the hook that performs the fork: the views offer the choice, and
 * only one of the two surfaces knows how to carry it out.
 */
export type ChatForkTarget = "workspace" | "worktree";
