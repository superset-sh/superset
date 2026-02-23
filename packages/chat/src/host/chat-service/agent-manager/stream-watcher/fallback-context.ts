export interface BuildFallbackSessionContextInput {
	defaultModelId: string;
	cwd: string;
	apiUrl: string;
	lastKnownModelId?: string | null;
	lastKnownPermissionMode?: string | null;
	lastKnownThinkingEnabled?: boolean | null;
	authHeaders?: Record<string, string>;
}

export interface FallbackSessionContext {
	cwd: string;
	modelId: string;
	permissionMode?: string;
	thinkingEnabled?: boolean;
	requestEntries: [string, string][];
}

export function buildFallbackSessionContext(
	input: BuildFallbackSessionContextInput,
): FallbackSessionContext {
	const modelId = input.lastKnownModelId ?? input.defaultModelId;
	const permissionMode = input.lastKnownPermissionMode ?? "default";
	const thinkingEnabled = input.lastKnownThinkingEnabled ?? false;
	const requestEntries: [string, string][] = [
		["modelId", modelId],
		["cwd", input.cwd],
		["apiUrl", input.apiUrl],
	];

	const authHeaders = input.authHeaders ?? {};
	if (Object.keys(authHeaders).length > 0) {
		requestEntries.push(["authHeaders", JSON.stringify(authHeaders)]);
	}
	if (thinkingEnabled) {
		requestEntries.push(["thinkingEnabled", "true"]);
	}

	return {
		cwd: input.cwd,
		modelId,
		permissionMode,
		thinkingEnabled,
		requestEntries,
	};
}
