/**
 * State of a workspace's linked pull request.
 *
 * Lives in `shared` because both the dashboard sidebar and the renderer's
 * pane-MRU store describe it, and a store must not depend on a route
 * component for a type.
 */
export type PullRequestState =
	| "open"
	| "merged"
	| "closed"
	| "draft"
	| "queued";
