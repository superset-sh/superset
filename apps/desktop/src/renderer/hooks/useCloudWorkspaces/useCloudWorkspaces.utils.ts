/**
 * Whether the cloud list is known to be complete. A flag that is off, or
 * that will never load (PostHog not initialized, or its flags request
 * failed), means the sidebar shows no cloud workspaces at all, so there is
 * nothing to wait for. Otherwise the server must have answered in this
 * window.
 */
export function isCloudWorkspaceListLive({
	flagEnabled,
	flagsSettled,
	queryAnsweredInThisWindow,
}: {
	flagEnabled: boolean | undefined;
	flagsSettled: boolean;
	/** The list query is enabled and succeeded with data fetched in this window. */
	queryAnsweredInThisWindow: boolean;
}): boolean {
	if (flagEnabled === false) return true;
	if (flagEnabled === undefined) return flagsSettled;
	return queryAnsweredInThisWindow;
}
