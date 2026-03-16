import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
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

export interface WorkspaceHostDeviceOption {
	id: string;
	name: string;
	type: "host" | "cloud" | "viewer";
	isOnline: boolean;
}

interface UseWorkspaceHostOptionsResult {
	currentDeviceName: string | null;
	localHostService: OrgService | null;
	otherDevices: WorkspaceHostDeviceOption[];
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
	const { services } = useHostService();
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
				.sort((a, b) => a.name.localeCompare(b.name)),
		[accessibleDevices, deviceInfo?.deviceId],
	);

	return {
		currentDeviceName: deviceInfo?.deviceName ?? null,
		localHostService,
		otherDevices,
	};
}
