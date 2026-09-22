/**
 * Per-file cap on the inline upload — bytes sent base64 in the request body,
 * so the ceiling is really the transport's rather than a product decision.
 * `importFromCloud` has no equivalent limit here: those bytes arrive from
 * cloud storage, and what a composer may send is decided by
 * `@superset/shared/attachment-limits`.
 */
export const MAX_INLINE_ATTACHMENT_BYTES = 25 * 1024 * 1024;
