/**
 * Shared file plumbing, deliberately domain-neutral: one presign path, one
 * sha256 identity, one sniff gate. Policy — what a caller may upload, how
 * large, how long it lives — belongs to the domain router that owns the
 * upload, not here.
 */

/** The ceiling the plumbing enforces. Domains set their own, lower. */
export const MAX_FILE_BYTES = 1024 * 1024 * 1024;

/** Enough of the object to identify every signature `sniff` knows. */
export const SNIFF_BYTES = 8 * 1024;
