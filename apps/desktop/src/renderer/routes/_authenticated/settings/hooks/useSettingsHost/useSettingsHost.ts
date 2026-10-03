import { useLingui } from "@lingui/react/macro";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { HostSelectOption } from "../../components/HostSelect";

export interface SettingsHostSearch {
	hostId?: string;
}

export function validateSettingsHostSearch(
	search: Record<string, unknown>,
): SettingsHostSearch {
	return {
		hostId: typeof search.hostId === "string" ? search.hostId : undefined,
	};
}

export interface SettingsHost {
	hostId: string | null;
	hostUrl: string | null;
	hostOptions: HostSelectOption[];
	selectedHost: HostSelectOption | null;
	hostName: string;
	hasMultipleHosts: boolean;
	isLocal: boolean;
	isOnline: boolean;
	selectHost: (hostId: string) => void;
}

export function useSettingsHost(): SettingsHost {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { hostId: searchHostId } = useSearch({ strict: false });
	const { machineId } = useLocalHostService();
	const { currentDeviceName, localHostId, otherHosts } =
		useWorkspaceHostOptions();
	const hostUrl = useHostUrl(searchHostId ?? null);
	const hostId = searchHostId ?? machineId;

	const hostOptions = useMemo<HostSelectOption[]>(() => {
		const thisDeviceLabel = t({
			message: "This device",
		});
		const options: HostSelectOption[] = [];
		if (localHostId) {
			options.push({
				id: localHostId,
				name: currentDeviceName ?? thisDeviceLabel,
				isLocal: true,
				isOnline: true,
			});
		}
		for (const host of otherHosts) {
			options.push({
				id: host.id,
				name: host.name,
				isLocal: false,
				isOnline: host.isOnline,
			});
		}
		if (hostId && !options.some((o) => o.id === hostId)) {
			options.push({
				id: hostId,
				name: hostId === machineId ? thisDeviceLabel : hostId,
				isLocal: hostId === machineId,
				isOnline: hostId === machineId,
			});
		}
		return options;
	}, [currentDeviceName, localHostId, machineId, otherHosts, hostId, t]);

	const selectedHost = useMemo(
		() => hostOptions.find((o) => o.id === hostId) ?? null,
		[hostOptions, hostId],
	);

	const isLocal = selectedHost?.isLocal ?? true;
	const hostName =
		isLocal || !selectedHost
			? t({
					message: "this device",
				})
			: selectedHost.name;

	const selectHost = useCallback(
		(nextHostId: string) => {
			void navigate({
				to: ".",
				search: (prev) => ({
					...prev,
					hostId: nextHostId === machineId ? undefined : nextHostId,
				}),
				replace: true,
			});
		},
		[machineId, navigate],
	);

	return {
		hostId,
		hostUrl,
		hostOptions,
		selectedHost,
		hostName,
		hasMultipleHosts: hostOptions.length > 1,
		isLocal,
		isOnline: selectedHost?.isOnline ?? true,
		selectHost,
	};
}
