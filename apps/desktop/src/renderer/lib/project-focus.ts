/**
 * Captures the `projectFocus` query param from the initial URL hash
 * BEFORE the router replaces it.
 *
 * This module MUST be imported before `persistent-hash-history` in the
 * entry point, otherwise the hash will already be overwritten.
 */
const initialHash = window.location.hash; // e.g. "#/?projectFocus=abc123"
const qIndex = initialHash.indexOf("?");
const params = qIndex !== -1 ? new URLSearchParams(initialHash.slice(qIndex)) : null;

export const initialProjectFocusId: string | null =
	params?.get("projectFocus") ?? null;
