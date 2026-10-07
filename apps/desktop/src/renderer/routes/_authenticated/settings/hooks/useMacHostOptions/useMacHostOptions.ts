import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import type { HostSelectOption } from "../../components/HostSelect";

export function useMacHostOptions(): {
	options: HostSelectOption[];
	settled: boolean;
} {
	const { t } = useLingui();
	const {
		currentDeviceName,
		localHostId,
		otherHosts,
		settled: hostsSettled,
	} = useWorkspaceHostOptions();
	const { data: desktopPlatform } = electronTrpc.window.getPlatform.useQuery();
	const options = useMemo<HostSelectOption[]>(() => {
		const macHosts: HostSelectOption[] = [];
		if (localHostId && desktopPlatform === "darwin") {
			macHosts.push({
				id: localHostId,
				name: currentDeviceName ?? t({ message: "This device" }),
				isLocal: true,
				isOnline: true,
			});
		}
		for (const host of otherHosts) {
			if (host.platform !== "darwin") continue;
			macHosts.push({
				id: host.id,
				name: host.name,
				isLocal: false,
				isOnline: host.isOnline,
			});
		}
		return macHosts;
	}, [currentDeviceName, desktopPlatform, localHostId, otherHosts, t]);
	return {
		options,
		settled:
			desktopPlatform !== undefined && (options.length > 0 || hostsSettled),
	};
}
