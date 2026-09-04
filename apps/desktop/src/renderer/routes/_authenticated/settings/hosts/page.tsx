import { Trans } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useHostsPresence } from "renderer/hooks/useHostsPresence";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export const Route = createFileRoute("/_authenticated/settings/hosts/")({
	component: HostsIndexPage,
});

function HostsIndexPage() {
	const navigate = useNavigate();

	const { data: hosts = [], isPending } =
		cloudTrpc.v2Host.list.useQuery(undefined);

	const presence = useHostsPresence(hosts);

	const firstHostId = useMemo(() => {
		const sorted = [...hosts].sort((a, b) => a.name.localeCompare(b.name));
		const online = sorted.find((h) => presence?.get(h.machineId) ?? h.isOnline);
		return (online ?? sorted[0])?.machineId ?? null;
	}, [hosts, presence]);

	useEffect(() => {
		if (firstHostId) {
			navigate({
				to: "/settings/hosts/$hostId",
				params: { hostId: firstHostId },
				replace: true,
			});
		}
	}, [firstHostId, navigate]);

	if (hosts.length === 0) {
		if (isPending) return null;
		return (
			<div className="flex items-center justify-center h-full p-6 text-sm text-muted-foreground">
				<Trans>No hosts yet.</Trans>
			</div>
		);
	}

	return null;
}
