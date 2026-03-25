export interface SshChatAvailabilityInput {
	sshHostId: string | null;
	sshHostName: string | null;
	hasModelProviderCredentials: boolean | null | undefined;
}

export function getSshChatUnavailableMessage({
	sshHostId,
	sshHostName,
	hasModelProviderCredentials,
}: SshChatAvailabilityInput): string | null {
	if (!sshHostId) {
		return null;
	}

	if (hasModelProviderCredentials === false) {
		return `Chat is disabled for ${sshHostName ?? "this SSH host"} because the remote machine does not have model provider credentials configured.`;
	}

	return null;
}
