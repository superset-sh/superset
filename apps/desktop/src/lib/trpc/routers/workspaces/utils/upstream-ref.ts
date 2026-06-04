export interface ParsedUpstreamRef {
	remoteName: string;
	branchName: string;
}

export function parseUpstreamRef(
	upstreamRef: string,
): ParsedUpstreamRef | null {
	const separatorIndex = upstreamRef.indexOf("/");
	if (separatorIndex <= 0 || separatorIndex === upstreamRef.length - 1) {
		return null;
	}

	return {
		remoteName: upstreamRef.slice(0, separatorIndex),
		branchName: upstreamRef.slice(separatorIndex + 1),
	};
}

export function resolveTrackingRemoteName(
	upstreamRef: string | null | undefined,
	fallback = "origin",
): string {
	if (!upstreamRef) {
		return fallback;
	}

	return parseUpstreamRef(upstreamRef.trim())?.remoteName ?? fallback;
}
