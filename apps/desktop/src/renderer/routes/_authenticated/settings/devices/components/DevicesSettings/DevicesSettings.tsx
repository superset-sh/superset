import { Button } from "@superset/ui/button";
import { Card, CardContent } from "@superset/ui/card";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import {
	HiOutlineComputerDesktop,
	HiOutlineDevicePhoneMobile,
	HiOutlineGlobeAlt,
	HiOutlineServer,
} from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	getSshHostServiceKey,
	useHostService,
} from "renderer/routes/_authenticated/providers/HostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";
import type { SshHostConnectionStatus } from "shared/ssh-hosts";

const DEVICE_ICONS = {
	desktop: HiOutlineComputerDesktop,
	mobile: HiOutlineDevicePhoneMobile,
	web: HiOutlineGlobeAlt,
};

const ONLINE_THRESHOLD_MS = 30_000;

function getHostStatusText(status: SshHostConnectionStatus | null) {
	if (!status) {
		return "Checking connection";
	}

	if (status.missingPrerequisites.length > 0) {
		return `Missing prerequisites: ${status.missingPrerequisites.join(", ")}`;
	}

	if (status.state === "ready") {
		return status.health?.hasModelProviderCredentials === false
			? "Connected, chat unavailable"
			: "Connected";
	}

	if (status.lastError) {
		return status.lastError;
	}

	return `State: ${status.state}`;
}

function getHostStatusTone(status: SshHostConnectionStatus | null) {
	if (!status) {
		return "bg-amber-500";
	}

	if (status.state === "ready") {
		return status.health?.hasModelProviderCredentials === false
			? "bg-amber-500"
			: "bg-emerald-500";
	}

	if (status.state === "error") {
		return "bg-red-500";
	}

	return "bg-amber-500";
}

export function DevicesSettings() {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const utils = electronTrpc.useUtils();
	const { sshHosts, sshStatuses } = useHostService();
	const [editingHostId, setEditingHostId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [sshTarget, setSshTarget] = useState("");
	const [remoteRootDir, setRemoteRootDir] = useState("");

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: allDevices } = useLiveQuery(
		(q) =>
			q
				.from({ devicePresence: collections.devicePresence })
				.innerJoin({ users: collections.users }, ({ devicePresence, users }) =>
					eq(devicePresence.userId, users.id),
				)
				.select(({ devicePresence, users }) => ({
					...devicePresence,
					ownerName: users.name,
				})),
		[collections],
	);

	const upsertHost =
		electronTrpc.hostServiceManager.sshHosts.upsert.useMutation({
			onSuccess: async (_data, variables) => {
				await utils.hostServiceManager.sshHosts.list.invalidate();
				if (activeOrganizationId) {
					await utils.sshTunnels.connect.invalidate({
						hostId: variables.id,
					});
					await utils.sshTunnels.connect.fetch({
						hostId: variables.id,
					});
				}
				toast.success(editingHostId ? "SSH host updated" : "SSH host saved");
				setEditingHostId(null);
				setName("");
				setSshTarget("");
				setRemoteRootDir("");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		});
	const removeHost =
		electronTrpc.hostServiceManager.sshHosts.remove.useMutation({
			onSuccess: async () => {
				await utils.hostServiceManager.sshHosts.list.invalidate();
				toast.success("SSH host removed");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		});
	const disconnectHost = electronTrpc.sshTunnels.disconnect.useMutation({
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const devices = useMemo(
		() =>
			allDevices?.filter(
				(device) =>
					Date.now() - new Date(device.lastSeenAt).getTime() <
					ONLINE_THRESHOLD_MS,
			) ?? [],
		[allDevices],
	);

	const configuredHosts = useMemo(
		() =>
			sshHosts.map((host) => ({
				...host,
				status:
					activeOrganizationId === null
						? null
						: (sshStatuses.get(getSshHostServiceKey(host.id)) ?? null),
			})),
		[activeOrganizationId, sshHosts, sshStatuses],
	);

	const formatLastSeen = (date: Date) => {
		const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		return new Date(date).toLocaleTimeString();
	};

	const handleReconnect = async (hostId: string) => {
		if (!activeOrganizationId) {
			toast.error("No active organization selected");
			return;
		}

		await disconnectHost.mutateAsync({
			hostId,
		});
		await utils.sshTunnels.connect.fetch({
			hostId,
		});
		await utils.sshTunnels.connect.invalidate({
			hostId,
		});
		toast.success("SSH host reconnected");
	};

	return (
		<div className="max-w-3xl p-6">
			<div className="mb-8">
				<h1 className="mb-2 text-2xl font-semibold">Devices</h1>
				<p className="text-sm text-muted-foreground">
					Monitor online devices and configure SSH-backed workspace hosts.
				</p>
			</div>

			<div className="mb-10">
				<h2 className="mb-2 text-lg font-medium">Online Devices</h2>
				<p className="mb-4 text-sm text-muted-foreground">
					Devices currently connected to your organization.
				</p>

				{devices.length === 0 && (
					<div className="text-sm text-muted-foreground">No devices online</div>
				)}

				<div className="space-y-3">
					{devices.map((device) => {
						const Icon =
							DEVICE_ICONS[device.deviceType] || HiOutlineComputerDesktop;

						return (
							<div
								key={device.id}
								className="flex items-center gap-4 rounded-lg border bg-card p-4"
							>
								<div className="rounded-md bg-accent p-2">
									<Icon className="h-5 w-5" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="truncate font-medium">
										{device.deviceName}
									</div>
									<div className="text-sm text-muted-foreground">
										{device.ownerName ?? "Unknown"} &middot; {device.deviceType}{" "}
										&middot; {formatLastSeen(device.lastSeenAt)}
									</div>
								</div>
								<div className="flex items-center gap-2">
									<div className="h-2 w-2 rounded-full bg-green-500" />
									<span className="text-sm text-muted-foreground">Online</span>
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<div className="space-y-6">
				<div>
					<h2 className="mb-2 text-lg font-medium">SSH Hosts</h2>
					<p className="text-sm text-muted-foreground">
						Configure remote machines that can run the v2 host-service over SSH.
					</p>
				</div>

				<Card>
					<CardContent className="space-y-4 pt-6">
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="ssh-host-name">Display name</Label>
								<Input
									id="ssh-host-name"
									placeholder="homebox"
									value={name}
									onChange={(event) => setName(event.target.value)}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="ssh-host-target">SSH target</Label>
								<Input
									id="ssh-host-target"
									placeholder="user@host"
									value={sshTarget}
									onChange={(event) => setSshTarget(event.target.value)}
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="ssh-host-root">Remote root directory</Label>
							<Input
								id="ssh-host-root"
								placeholder="~/.superset/ssh-hosts/homebox"
								value={remoteRootDir}
								onChange={(event) => setRemoteRootDir(event.target.value)}
							/>
							<p className="text-xs text-muted-foreground">
								Optional. Leave blank to use the default Superset directory on
								the remote machine.
							</p>
						</div>

						<div className="flex items-center gap-2">
							<Button
								onClick={() =>
									upsertHost.mutate({
										id: editingHostId ?? crypto.randomUUID(),
										name,
										sshTarget,
										remoteRootDir: remoteRootDir.trim() || undefined,
									})
								}
								disabled={
									upsertHost.isPending ||
									name.trim().length === 0 ||
									sshTarget.trim().length === 0
								}
							>
								{editingHostId ? "Update Host" : "Add Host"}
							</Button>
							{editingHostId && (
								<Button
									variant="outline"
									onClick={() => {
										setEditingHostId(null);
										setName("");
										setSshTarget("");
										setRemoteRootDir("");
									}}
								>
									Cancel
								</Button>
							)}
						</div>
					</CardContent>
				</Card>

				<div className="space-y-3">
					{configuredHosts.length === 0 ? (
						<div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
							No SSH hosts configured yet.
						</div>
					) : (
						configuredHosts.map((host) => (
							<Card key={host.id}>
								<CardContent className="pt-6">
									<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-3">
												<div className="rounded-md bg-accent p-2">
													<HiOutlineServer className="h-5 w-5" />
												</div>
												<div className="min-w-0">
													<div className="truncate font-medium">
														{host.name}
													</div>
													<div className="truncate text-sm text-muted-foreground">
														{host.sshTarget}
													</div>
												</div>
											</div>
											<div className="mt-3 flex items-center gap-2 text-sm">
												<span
													className={`h-2 w-2 rounded-full ${getHostStatusTone(host.status)}`}
												/>
												<span>{getHostStatusText(host.status)}</span>
											</div>
											{host.remoteRootDir && (
												<div className="mt-2 text-xs text-muted-foreground">
													Remote root: {host.remoteRootDir}
												</div>
											)}
											{host.status?.health?.hasModelProviderCredentials ===
												false && (
												<div className="mt-2 text-xs text-amber-600">
													The remote machine is connected, but chat is disabled
													until model provider credentials are configured there.
												</div>
											)}
										</div>
										<div className="flex flex-wrap gap-2">
											<Button
												variant="outline"
												onClick={() => {
													setEditingHostId(host.id);
													setName(host.name);
													setSshTarget(host.sshTarget);
													setRemoteRootDir(host.remoteRootDir ?? "");
												}}
											>
												Edit
											</Button>
											<Button
												variant="outline"
												onClick={() => handleReconnect(host.id)}
												disabled={disconnectHost.isPending}
											>
												Reconnect
											</Button>
											<Button
												variant="outline"
												onClick={async () => {
													if (!activeOrganizationId) {
														toast.error("No active organization selected");
														return;
													}
													await disconnectHost.mutateAsync({
														hostId: host.id,
													});
													await utils.sshTunnels.connect.invalidate({
														hostId: host.id,
													});
													toast.success("SSH host disconnected");
												}}
												disabled={
													!activeOrganizationId || disconnectHost.isPending
												}
											>
												Disconnect
											</Button>
											<Button
												variant="outline"
												onClick={() => removeHost.mutate({ hostId: host.id })}
												disabled={removeHost.isPending}
											>
												Remove
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>
						))
					)}
				</div>
			</div>
		</div>
	);
}
