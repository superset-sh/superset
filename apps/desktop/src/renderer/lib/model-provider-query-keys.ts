export function modelProvidersQueryKey(hostUrl: string | null | undefined) {
	return ["model-providers", hostUrl ?? null] as const;
}

export function workspaceModelProvidersQueryKey(
	hostUrl: string | null | undefined,
) {
	return ["workspace-model-providers", hostUrl ?? null] as const;
}

export function chatModelsQueryKey(
	hostUrl: string | null | undefined,
	scope?: string | null,
) {
	return ["chat", "models", hostUrl ?? null, scope ?? null] as const;
}
