export const PAGE_CONTENT_TYPES = ["text/html"] as const;

/**
 * The document alone; assets have their own ceiling. Uploaded straight to
 * storage on a presigned URL, so the API's request body never carries it.
 */
export const MAX_PAGE_BYTES = 16 * 1024 * 1024;
