import { useCallback, useState } from "react";

/**
 * Renderer-only state for the mock: what a real version stores per user in
 * the cloud database. Module scope keeps a choice while switching agents.
 */
export type CloudAuthMethod = "subscription" | "api_key" | "custom";
export type CustomProvider = "bedrock" | "vertex" | "gateway" | "manual";

export interface CloudAuthState {
	method: CloudAuthMethod;
	subscriptionConnected: boolean;
	apiKeySaved: boolean;
	customProvider: CustomProvider | null;
	customSaved: boolean;
}

const DEFAULT_STATE: CloudAuthState = {
	method: "subscription",
	subscriptionConnected: false,
	apiKeySaved: false,
	customProvider: null,
	customSaved: false,
};

const store = new Map<string, CloudAuthState>();

export function useCloudAuthMock(presetId: string) {
	const [state, setState] = useState<CloudAuthState>(
		() => store.get(presetId) ?? DEFAULT_STATE,
	);
	const update = useCallback(
		(patch: Partial<CloudAuthState>) => {
			setState((prev) => {
				const next = { ...prev, ...patch };
				store.set(presetId, next);
				return next;
			});
		},
		[presetId],
	);
	return [state, update] as const;
}

export function isConfigured(state: CloudAuthState): boolean {
	if (state.method === "subscription") return state.subscriptionConnected;
	if (state.method === "api_key") return state.apiKeySaved;
	return state.customSaved;
}
