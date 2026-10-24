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

export const MAX_CHAT_IMAGE_BYTES = 50 * 1024 * 1024;

/** Per send, matching what the desktop terminal composer accepts. */
export const MAX_ATTACHMENTS = 10;

/**
 * Per file, for bytes sent base64 in a request body to a host, and read back
 * the same way. The ceiling is the transport's: the host holds the body in
 * memory. A workspace on a machine someone owns refuses above it, because its
 * attachments must not go through our storage.
 */
export const MAX_INLINE_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Largest image a transcript renders inline; anything larger is a name badge. */
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

/** A host's attachment store removes an entry nobody has used for this long. */
export const ATTACHMENT_RETENTION_DAYS = 30;
