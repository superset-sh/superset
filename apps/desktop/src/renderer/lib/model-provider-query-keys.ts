export function modelProvidersQueryKey(hostUrl: string | null | undefined) {
	return ["model-providers", hostUrl ?? null] as const;
}

export function workspaceModelProvidersQueryKey(
	hostUrl: string | null | undefined,
) {
	return ["workspace-model-providers", hostUrl ?? null] as const;
}

export function chatModelsQueryKey(hostUrl: string | null | undefined) {
	return ["chat", "models", hostUrl ?? null] as const;
}
