import { useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** How the dialog is showing the credential; not every one of these is stored. */
export type CloudAuthMethod = "subscription" | "api_key" | "custom";
export type CustomProvider = "bedrock" | "gateway" | "manual";

export interface CloudAuthState {
	method: CloudAuthMethod;
	subscriptionConnected: boolean;
	apiKeySaved: boolean;
	customProvider: CustomProvider | null;
	customSaved: boolean;
}

export interface SaveCredentialInput {
	kind: "subscription" | "api_key";
	value: string;
	baseUrl?: string;
	accountLabel?: string;
}

/**
 * A stored credential read back as the shape the dialog renders. A key with
 * its own endpoint reads as a custom provider; one without is the plain API
 * key option.
 */
function methodOf(credential: {
	kind: "subscription" | "api_key";
	baseUrl: string | null;
}): CloudAuthMethod {
	if (credential.kind === "subscription") return "subscription";
	return credential.baseUrl ? "custom" : "api_key";
}

export function useAgentCredential(presetId: string) {
	const utils = cloudTrpc.useUtils();
	const query = cloudTrpc.agentCredential.list.useQuery();
	const credential = query.data?.find((row) => row.agent === presetId) ?? null;
	const stored = credential ? methodOf(credential) : null;

	// The radio can move before anything is saved, so the chosen method is
	// local until a save lands and the stored one takes over again.
	const [chosen, setChosen] = useState<CloudAuthMethod | null>(null);
	const method = chosen ?? stored ?? "subscription";

	const invalidate = () => utils.agentCredential.list.invalidate();
	const save = cloudTrpc.agentCredential.set.useMutation({
		onSuccess: () => {
			setChosen(null);
			return invalidate();
		},
	});
	const remove = cloudTrpc.agentCredential.remove.useMutation({
		onSuccess: () => invalidate(),
	});

	const state: CloudAuthState = {
		method,
		subscriptionConnected: stored === "subscription",
		apiKeySaved: stored === "api_key",
		customProvider: stored === "custom" ? "manual" : null,
		customSaved: stored === "custom",
	};

	return {
		state,
		accountLabel: credential?.accountLabel ?? null,
		isLoading: query.isLoading,
		chooseMethod: setChosen,
		save: (input: SaveCredentialInput) =>
			save.mutateAsync({ agent: presetId, ...input }),
		disconnect: () => remove.mutateAsync({ agent: presetId }),
		removing: remove.isPending,
	};
}

export function isConfigured(state: CloudAuthState): boolean {
	return state.subscriptionConnected || state.apiKeySaved || state.customSaved;
}
