export function capabilityArtifactDownloadUrl(args: {
	apiUrl: string;
	versionId: string;
	sha256: string;
}): string {
	const baseUrl = args.apiUrl.replace(/\/+$/, "");
	return `${baseUrl}/api/capability-artifacts/${encodeURIComponent(args.versionId)}/${encodeURIComponent(args.sha256)}.zip`;
}
