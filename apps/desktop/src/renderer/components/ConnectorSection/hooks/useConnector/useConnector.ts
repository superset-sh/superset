import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const POLL_MS = 5_000;

export function useConnector(
	slug: string,
	explicitOrganizationId?: string | null,
	onConnected?: () => void,
) {
	const utils = cloudTrpc.useUtils();

	const myOrganization = cloudTrpc.user.myOrganization.useQuery(undefined, {
		enabled: !explicitOrganizationId,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const organizationId =
		explicitOrganizationId ?? myOrganization.data?.id ?? "";

	const connector = cloudTrpc.connectors.get.useQuery(
		{ slug },
		{ staleTime: Number.POSITIVE_INFINITY },
	);

	const status = cloudTrpc.connectors.status.useQuery(
		{ organizationId },
		{
			enabled: Boolean(organizationId),
			refetchInterval: POLL_MS,
			refetchIntervalInBackground: false,
			refetchOnWindowFocus: true,
			staleTime: 0,
		},
	);

	const connection = status.data?.find((row) => row.connector === slug) ?? null;

	const wasConnected = useRef(Boolean(connection));
	useEffect(() => {
		if (connection && !wasConnected.current) onConnected?.();
		wasConnected.current = Boolean(connection);
	}, [connection, onConnected]);

	const invalidate = () =>
		utils.connectors.status.invalidate({ organizationId });

	const connectApiKey = cloudTrpc.connectors.connectApiKey.useMutation({
		onSuccess: invalidate,
	});

	const disconnect = cloudTrpc.connectors.disconnect.useMutation({
		onMutate: async ({ connectionId }) => {
			await utils.connectors.status.cancel({ organizationId });
			const previous = utils.connectors.status.getData({ organizationId });
			utils.connectors.status.setData({ organizationId }, (rows) =>
				(rows ?? []).filter((row) => row.id !== connectionId),
			);
			return { previous };
		},
		onError: (_error, _input, context) => {
			if (context?.previous)
				utils.connectors.status.setData({ organizationId }, context.previous);
		},
		onSettled: invalidate,
	});

	const openOAuth = (method: string) => {
		const url = new URL(
			`${env.NEXT_PUBLIC_API_URL}/api/connectors/${slug}/connect`,
		);
		url.searchParams.set("organizationId", organizationId);
		url.searchParams.set("method", method);
		window.open(url.toString(), "_blank", "noopener,noreferrer");
	};

	return {
		connector: connector.data ?? null,
		connection,
		organizationId,
		isPending:
			connector.isPending ||
			(Boolean(organizationId) && status.isPending) ||
			(!explicitOrganizationId && myOrganization.isPending),
		connectApiKey,
		disconnect: {
			...disconnect,
			mutate: (input: { connectionId: string }) =>
				disconnect.mutate({ organizationId, ...input }),
		},
		openOAuth,
	};
}
