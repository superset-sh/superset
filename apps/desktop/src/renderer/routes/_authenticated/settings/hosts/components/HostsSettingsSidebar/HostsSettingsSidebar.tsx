import { Trans, useLingui } from "@lingui/react/macro";
import {
	deriveHostVersionState,
	type HostVersionState,
} from "@superset/shared/host-version";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { LuPlus } from "react-icons/lu";
import { useAppVersion } from "renderer/hooks/host-version/useHostVersionState";
import { useHostsPresence } from "renderer/hooks/useHostsPresence";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { hostVersionDotClass } from "renderer/routes/_authenticated/components/HostVersionBadge";
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
	version: string | null;
	versionState: HostVersionState;
}

interface HostsSettingsSidebarProps {
	selectedHostId: string | null;
}

export function HostsSettingsSidebar({
	selectedHostId,
}: HostsSettingsSidebarProps) {
	const { t } = useLingui();
	const appVersion = useAppVersion();
	const { data: hosts = [] } = cloudTrpc.v2Host.list.useQuery(undefined);

	const presence = useHostsPresence(hosts);
	const hostsWithPresence = useMemo(
		() =>
			presence
				? hosts.map((host) => ({
						...host,
						isOnline: presence.get(host.machineId)?.online ?? host.isOnline,
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
				version: host.version,
				versionState: deriveHostVersionState(host.version, appVersion),
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
	}, [hostsWithPresence, appVersion, t]);

	return (
		<SettingsListSidebar
			searchPlaceholder={t({
				message: "Filter hosts...",
			})}
			searchAriaLabel={t({
				message: "Filter hosts",
			})}
			listHeader={
				<Link
					to="/settings/hosts/new"
					className={settingsListItemClass(
						false,
						"gap-2 text-muted-foreground",
					)}
				>
					<LuPlus className="size-3.5 shrink-0" />
					<span className="truncate flex-1">
						<Trans>Add host…</Trans>
					</span>
				</Link>
			}
			groups={listGroups}
			filterRow={(row, q) =>
				`${row.name} ${row.version ?? ""}`
					.toLowerCase()
					.includes(q.toLowerCase())
			}
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
							hostVersionDotClass(row.versionState, row.isOnline),
						)}
					/>
					<span className="truncate flex-1">{row.name}</span>
					{row.version && (
						<span
							className={cn(
								"shrink-0 font-mono text-[10.5px] tabular-nums",
								!row.isOnline
									? "text-muted-foreground/50"
									: row.versionState === "incompatible"
										? "text-destructive"
										: row.versionState === "behind"
											? "text-amber-600 dark:text-amber-400"
											: "text-muted-foreground/60",
							)}
						>
							{row.version}
						</span>
					)}
				</Link>
			)}
		/>
	);
}
