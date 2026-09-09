import type { RouterOutputs } from "@superset/trpc";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export type PluginConnection =
	RouterOutputs["plugins"]["connections"]["list"][number];

/**
 * Sends the browser to the provider. Stays a raw URL because the flow ends in
 * a redirect the system browser has to follow, which no procedure can express.
 */
export function openPluginOAuth(
	apiUrl: string,
	pluginName: string,
	inputs: Record<string, string>,
	method: string,
): void {
	const url = new URL(`${apiUrl}/api/plugins/${pluginName}/connect`);
	for (const [key, value] of Object.entries(inputs)) {
		url.searchParams.set(key, value);
	}
	url.searchParams.set("method", method);
	window.open(url.toString(), "_blank", "noopener,noreferrer");
}

export function usePluginConnections(pluginName: string) {
	const utils = cloudTrpc.useUtils();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;

	const refresh = async () => {
		await Promise.all([
			utils.plugins.connections.list.invalidate({ plugin: pluginName }),
			utils.plugins.list.invalidate(),
		]);
	};

	const connections = cloudTrpc.plugins.connections.list.useQuery(
		{ plugin: pluginName },
		{ enabled: Boolean(userId) },
	);

	const disconnect = cloudTrpc.plugins.connections.disconnect.useMutation({
		onMutate: async ({ connectionId }) => {
			await utils.plugins.connections.list.cancel({ plugin: pluginName });
			const previous = utils.plugins.connections.list.getData({
				plugin: pluginName,
			});
			utils.plugins.connections.list.setData({ plugin: pluginName }, (rows) =>
				(rows ?? []).filter((row) => row.id !== connectionId),
			);
			return { previous };
		},
		onError: (_error, _input, context) => {
			if (context?.previous) {
				utils.plugins.connections.list.setData(
					{ plugin: pluginName },
					context.previous,
				);
			}
		},
		onSettled: refresh,
	});

	const connectApiKey = cloudTrpc.plugins.connectApiKey.useMutation({
		onSuccess: refresh,
	});

	return {
		connections: connections.data ?? [],
		isLoading: connections.isLoading,
		error: connections.error,
		refetch: connections.refetch,
		connectOAuth: (inputs: Record<string, string> = {}, method = "oauth2") =>
			openPluginOAuth(env.NEXT_PUBLIC_API_URL, pluginName, inputs, method),
		connectApiKey: (inputs: Record<string, string>) =>
			connectApiKey.mutate({ name: pluginName, inputs }),
		isConnecting: connectApiKey.isPending,
		connectError: connectApiKey.error,
		disconnect: (connectionId: string) => disconnect.mutate({ connectionId }),
		isDisconnecting: disconnect.isPending,
	};
}
