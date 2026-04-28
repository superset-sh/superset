import { cn } from "@superset/ui/utils";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";

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
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const [filter, setFilter] = useState("");

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: hosts = [] } = useLiveQuery(
		(q) =>
			q
				.from({ hosts: collections.v2Hosts })
				.where(({ hosts }) =>
					eq(hosts.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ hosts }) => ({
					id: hosts.machineId,
					name: hosts.name,
					machineId: hosts.machineId,
					isOnline: hosts.isOnline,
				})),
		[collections, activeOrganizationId],
	);

	const { online, offline } = useMemo(() => {
		const trimmed = filter.trim().toLowerCase();
		const matches = trimmed
			? hosts.filter((h) => h.name.toLowerCase().includes(trimmed))
			: hosts;
		const sorted = [...matches].sort((a, b) => a.name.localeCompare(b.name));
		const online: HostRow[] = sorted.filter((h) => h.isOnline);
		const offline: HostRow[] = sorted.filter((h) => !h.isOnline);
		return { online, offline };
	}, [hosts, filter]);

	const isEmpty = hosts.length === 0;
	const noMatches = !isEmpty && online.length === 0 && offline.length === 0;
	const showHeaders = online.length > 0 && offline.length > 0;

	return (
		<div className="w-64 shrink-0 border-r overflow-y-auto">
			<div className="p-3 space-y-3">
				<div className="relative">
					<HiMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
					<input
						type="text"
						aria-label="Filter hosts"
						placeholder="Filter hosts..."
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						className="w-full h-8 pl-8 pr-2 text-sm bg-accent/50 rounded-md border-0 outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
					/>
				</div>

				{isEmpty && (
					<p className="px-2 text-sm text-muted-foreground">No hosts yet.</p>
				)}
				{noMatches && (
					<p className="px-2 text-sm text-muted-foreground">
						No hosts match "{filter}".
					</p>
				)}

				{online.length > 0 && (
					<Section title={showHeaders ? "Online" : null}>
						{online.map((row) => (
							<HostLink
								key={row.id}
								row={row}
								isActive={row.id === selectedHostId}
							/>
						))}
					</Section>
				)}
				{offline.length > 0 && (
					<Section title={showHeaders ? "Offline" : null}>
						{offline.map((row) => (
							<HostLink
								key={row.id}
								row={row}
								isActive={row.id === selectedHostId}
							/>
						))}
					</Section>
				)}
			</div>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string | null;
	children: React.ReactNode;
}) {
	return (
		<div>
			{title && (
				<h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">
					{title}
				</h2>
			)}
			<nav className="flex flex-col gap-0.5">{children}</nav>
		</div>
	);
}

function HostLink({ row, isActive }: { row: HostRow; isActive: boolean }) {
	return (
		<Link
			to="/settings/hosts/$hostId"
			params={{ hostId: row.id }}
			className={cn(
				"flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors",
				isActive
					? "bg-accent text-accent-foreground"
					: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
			)}
		>
			<span
				className={cn(
					"h-1.5 w-1.5 rounded-full shrink-0",
					row.isOnline ? "bg-emerald-500" : "bg-muted-foreground/40",
				)}
			/>
			<span className="truncate flex-1">{row.name}</span>
		</Link>
	);
}
