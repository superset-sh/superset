import { eq, useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	type OrgService,
	useHostService,
} from "renderer/routes/_authenticated/providers/HostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";

const ONLINE_THRESHOLD_MS = 30_000;

interface AccessibleDevice {
	id: string;
	name: string;
	type: "host" | "cloud" | "viewer";
	lastSeenAt: Date | null;
}

export interface WorkspaceHostDeviceOption {
	id: string;
	name: string;
	type: AccessibleDevice["type"];
	isOnline: boolean;
}

function isDeviceOnline(lastSeenAt: Date | null): boolean {
	return (
		lastSeenAt !== null &&
		Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS
	);
}

interface UseWorkspaceHostOptionsResult {
	currentDeviceName: string | null;
	localHostService: OrgService | null;
	otherDevices: WorkspaceHostDeviceOption[];
}

export function useWorkspaceHostOptions(): UseWorkspaceHostOptionsResult {
	const { data: session } = authClient.useSession();
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const currentUserId = session?.user?.id ?? null;
	const collections = useCollections();
	const { services } = useHostService();
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();

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
				.where(({ userDevices }) => eq(userDevices.userId, currentUserId ?? ""))
				.select(({ devices, presence }) => ({
					id: devices.id,
					name: devices.name,
					type: devices.type,
					lastSeenAt: presence?.lastSeenAt ?? null,
				})),
		[collections, currentUserId],
	);

	const otherDevices = useMemo(
		() =>
			[...accessibleDevices]
				.filter((device) => device.id !== deviceInfo?.deviceId)
				.map((device) => ({
					id: device.id,
					name: device.name,
					type: device.type,
					isOnline: isDeviceOnline(device.lastSeenAt),
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[accessibleDevices, deviceInfo?.deviceId],
	);

	return {
		currentDeviceName: deviceInfo?.deviceName ?? null,
		localHostService,
		otherDevices,
	};
}
