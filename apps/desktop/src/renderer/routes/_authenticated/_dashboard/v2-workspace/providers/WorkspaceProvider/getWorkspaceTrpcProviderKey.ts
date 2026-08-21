export function getWorkspaceTrpcProviderKey({
	workspaceId,
	hostUrl,
	isLocalWorkspace,
}: {
	workspaceId: string;
	hostUrl: string;
	isLocalWorkspace: boolean;
}): string {
	return isLocalWorkspace ? workspaceId : `${workspaceId}:${hostUrl}`;
}
