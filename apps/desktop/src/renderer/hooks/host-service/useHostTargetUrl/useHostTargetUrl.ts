import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import type { WorkspaceHostTarget } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/types";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export function useHostTargetUrl(
	hostTarget: WorkspaceHostTarget | null | undefined,
): string | null {
	const { activeHostUrl } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId ?? null;

	return useMemo(() => {
		if (!hostTarget) return null;
		if (hostTarget.kind === "local") return activeHostUrl;
		if (!activeOrganizationId) return null;
		const routingKey = buildHostRoutingKey(
			activeOrganizationId,
			hostTarget.hostId,
		);
		return `${env.RELAY_URL}/hosts/${routingKey}`;
	}, [hostTarget, activeOrganizationId, activeHostUrl]);
}
