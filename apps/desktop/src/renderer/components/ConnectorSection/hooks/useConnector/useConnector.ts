import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const POLL_MS = 5_000;

const EMPTY: never[] = [];

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

	const connections =
		status.data?.filter((row) => row.connector === slug) ?? EMPTY;
	const connection = connections[0] ?? null;

	const previousCount = useRef(connections.length);
	useEffect(() => {
		if (connections.length > previousCount.current) onConnected?.();
		previousCount.current = connections.length;
	}, [connections.length, onConnected]);

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

	const rename = cloudTrpc.connectors.rename.useMutation({
		onMutate: async ({ connectionId, label }) => {
			await utils.connectors.status.cancel({ organizationId });
			const previous = utils.connectors.status.getData({ organizationId });
			utils.connectors.status.setData({ organizationId }, (rows) =>
				(rows ?? []).map((row) =>
					row.id === connectionId ? { ...row, externalUserLabel: label } : row,
				),
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
		connections,
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
		rename: {
			...rename,
			mutate: (input: { connectionId: string; label: string }) =>
				rename.mutate({
					organizationId,
					connectionId: input.connectionId,
					label: input.label.trim(),
				}),
		},
		openOAuth,
	};
}
