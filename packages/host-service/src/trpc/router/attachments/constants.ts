/**
 * Per-file upload cap. Sized for image/PDF/source-file attachments fed
 * into coding agents. Larger blobs (e.g. video) belong in a different
 * flow.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
