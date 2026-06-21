const CAPABILITY_ARTIFACT_REFERENCE_PREFIX = "superset-artifact:";

export function normalizeCapabilityArtifactPathname(pathname: string): string {
	const normalized = pathname.trim().replace(/^\/+/, "");
	if (
		!normalized ||
		normalized.includes("\0") ||
		normalized.includes("\\") ||
		normalized.split("/").includes("..")
	) {
		throw new Error("Invalid capability artifact pathname.");
	}
	return normalized;
}

export function capabilityArtifactReference(pathname: string): string {
	return `${CAPABILITY_ARTIFACT_REFERENCE_PREFIX}${encodeURIComponent(normalizeCapabilityArtifactPathname(pathname))}`;
}

export function parseCapabilityArtifactReference(value: string): string | null {
	if (!value.startsWith(CAPABILITY_ARTIFACT_REFERENCE_PREFIX)) return null;
	const encoded = value.slice(CAPABILITY_ARTIFACT_REFERENCE_PREFIX.length);
	if (!encoded) return null;
	try {
		return normalizeCapabilityArtifactPathname(decodeURIComponent(encoded));
	} catch {
		return null;
	}
}
