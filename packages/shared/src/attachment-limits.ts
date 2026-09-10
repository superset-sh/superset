/**
 * What a composer will carry. Clients enforce these so a send that cannot
 * succeed is refused while the user is still looking at the picker; the API
 * enforces them again because a client is not a gate.
 *
 * These are policy, not transport: attachments upload straight to cloud
 * storage over a presigned PUT, so the old ceiling — the relay's buffered
 * request body — no longer applies. What bounds them now is that the bytes
 * land in someone's worktree.
 */

/** Per file. Large enough for an asset bundle a coding agent is given. */
export const MAX_ATTACHMENT_BYTES = 200 * 1024 * 1024;

/** Per send, matching what the desktop terminal composer accepts. */
export const MAX_ATTACHMENTS = 10;
