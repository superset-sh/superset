import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useHostsPresence } from "renderer/hooks/useHostsPresence";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	type SettingsListGroup,
	SettingsListSidebar,
	settingsListItemClass,
} from "../../../components/SettingsListSidebar";

interface HostRow {
	id: string;
	name: string;
	machineId: string;
	isOnline: boolean;
}

interface HostsSettingsSidebarProps {
	selectedHostId: string | null;
}

export function HostsSettingsSidebar({
	selectedHostId,
}: HostsSettingsSidebarProps) {
	const { t } = useLingui();
	const { data: hosts = [] } = cloudTrpc.v2Host.list.useQuery(undefined);

	const presence = useHostsPresence(hosts);
	const hostsWithPresence = useMemo(
		() =>
			presence
				? hosts.map((host) => ({
						...host,
						isOnline: presence.get(host.machineId) ?? host.isOnline,
					}))
				: hosts,
		[hosts, presence],
	);

	const listGroups = useMemo<Array<SettingsListGroup<HostRow>>>(() => {
		const sorted = hostsWithPresence
			.map((host) => ({
				id: host.machineId,
				name: host.name,
				machineId: host.machineId,
				isOnline: host.isOnline,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
		return [
			{
				id: "online",
				title: t({
					message: "Online",
				}),
				rows: sorted.filter((h) => h.isOnline),
			},
			{
				id: "offline",
				title: t({
					message: "Offline",
				}),
				rows: sorted.filter((h) => !h.isOnline),
			},
		];
	}, [hostsWithPresence, t]);

	return (
		<SettingsListSidebar
			searchPlaceholder={t({
				message: "Filter hosts...",
			})}
			searchAriaLabel={t({
				message: "Filter hosts",
			})}
			groups={listGroups}
			filterRow={(row, q) => row.name.toLowerCase().includes(q.toLowerCase())}
			getRowKey={(row) => row.id}
			emptyLabel={t({
				message: "No hosts yet.",
			})}
			noMatchLabel={(q) =>
				t({
					message: `No hosts match "${q}".`,
				})
			}
			renderRow={(row) => (
				<Link
					to="/settings/hosts/$hostId"
					params={{ hostId: row.id }}
					className={settingsListItemClass(row.id === selectedHostId, "gap-2")}
				>
					<span
						className={cn(
							"h-1.5 w-1.5 rounded-full shrink-0",
							row.isOnline ? "bg-emerald-500" : "bg-muted-foreground/40",
						)}
					/>
					<span className="truncate flex-1">{row.name}</span>
				</Link>
			)}
		/>
	);
}
