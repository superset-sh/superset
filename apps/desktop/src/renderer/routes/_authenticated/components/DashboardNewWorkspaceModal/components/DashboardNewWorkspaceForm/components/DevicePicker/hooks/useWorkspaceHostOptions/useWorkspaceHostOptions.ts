import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	getSshHostServiceKey,
	type OrgService,
	useHostService,
} from "renderer/routes/_authenticated/providers/HostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";
import type { SshHostConnectionStatus } from "shared/ssh-hosts";

const ONLINE_THRESHOLD_MS = 30_000;

export interface WorkspaceHostDeviceOption {
	id: string;
	name: string;
	type: "host" | "cloud" | "viewer";
	isOnline: boolean;
}

export interface WorkspaceHostSshOption {
	hostId: string;
	name: string;
	repoPath: string | null;
	remoteRootDir: string | null;
	sshTarget: string;
	status: SshHostConnectionStatus | null;
}

interface UseWorkspaceHostOptionsResult {
	activeOrganizationId: string | null;
	currentDeviceName: string | null;
	localHostService: OrgService | null;
	otherDevices: WorkspaceHostDeviceOption[];
	sshHosts: WorkspaceHostSshOption[];
}

function isDeviceOnline(lastSeenAt: Date | null): boolean {
	return (
		lastSeenAt !== null &&
		Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS
	);
}

export function useWorkspaceHostOptions(): UseWorkspaceHostOptionsResult {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const { services, sshHosts, sshStatuses } = useHostService();
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const currentUserId = session?.user?.id ?? null;

	const localHostService =
		activeOrganizationId !== null
			? (services.get(activeOrganizationId) ?? null)
			: null;

	const { data: accessibleDevices = [] } = useLiveQuery(
		(q) =>
			q
				.from({ userDevices: collections.v2UsersDevices })
				.innerJoin(
					{ devices: collections.v2Devices },
					({ userDevices, devices }) => eq(userDevices.deviceId, devices.id),
				)
				.leftJoin(
					{ presence: collections.v2DevicePresence },
					({ devices, presence }) => eq(devices.id, presence.deviceId),
				)
				.where(({ userDevices, devices }) =>
					and(
						eq(userDevices.userId, currentUserId ?? ""),
						eq(devices.organizationId, activeOrganizationId ?? ""),
					),
				)
				.select(({ devices, presence }) => ({
					id: devices.id,
					clientId: devices.clientId,
					name: devices.name,
					type: devices.type,
					lastSeenAt: presence?.lastSeenAt ?? null,
				})),
		[activeOrganizationId, collections, currentUserId],
	);

	const otherDevices = useMemo(
		() =>
			accessibleDevices
				.filter((device) => device.clientId !== deviceInfo?.deviceId)
				.map((device) => ({
					id: device.id,
					name: device.name,
					type: device.type,
					isOnline: isDeviceOnline(device.lastSeenAt),
				}))
				.sort((left, right) => left.name.localeCompare(right.name)),
		[accessibleDevices, deviceInfo?.deviceId],
	);

	const sshHostOptions = useMemo(
		() =>
			sshHosts
				.map((host) => ({
					hostId: host.id,
					name: host.name,
					repoPath: host.repoPath ?? null,
					remoteRootDir: host.remoteRootDir ?? null,
					sshTarget: host.sshTarget,
					status:
						activeOrganizationId === null
							? null
							: (sshStatuses.get(getSshHostServiceKey(host.id)) ?? null),
				}))
				.sort((left, right) => left.name.localeCompare(right.name)),
		[activeOrganizationId, sshHosts, sshStatuses],
	);

	return {
		activeOrganizationId,
		currentDeviceName: deviceInfo?.deviceName ?? null,
		localHostService,
		otherDevices,
		sshHosts: sshHostOptions,
	};
}
