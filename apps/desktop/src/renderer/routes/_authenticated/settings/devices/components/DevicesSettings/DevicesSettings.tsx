import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import {
	HiOutlineComputerDesktop,
	HiOutlineDevicePhoneMobile,
	HiOutlineGlobeAlt,
} from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

const DEVICE_ICONS = {
	desktop: HiOutlineComputerDesktop,
	mobile: HiOutlineDevicePhoneMobile,
	web: HiOutlineGlobeAlt,
};

const ONLINE_THRESHOLD_MS = 30_000;

export function DevicesSettings() {
	const collections = useCollections();

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

	// Filter to only devices seen within the last 30s
	const devices = useMemo(
		() =>
			allDevices?.filter(
				(d) =>
					Date.now() - new Date(d.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS,
			),
		[allDevices],
	);

	const formatLastSeen = (date: Date) => {
		const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		return new Date(date).toLocaleTimeString();
	};

	return (
		<div className="p-6 max-w-2xl">
			<div className="mb-6">
				<h1 className="text-2xl font-semibold mb-2">Online Devices</h1>
				<p className="text-muted-foreground text-sm">
					Devices currently connected to your organization.
				</p>
			</div>

			{devices?.length === 0 && (
				<div className="text-muted-foreground">No devices online</div>
			)}

			<div className="space-y-3">
				{devices?.map((device) => {
					const Icon =
						DEVICE_ICONS[device.deviceType] || HiOutlineComputerDesktop;
					return (
						<div
							key={device.id}
							className="flex items-center gap-4 p-4 bg-card border rounded-lg"
						>
							<div className="p-2 bg-accent rounded-md">
								<Icon className="h-5 w-5" />
							</div>
							<div className="flex-1 min-w-0">
								<div className="font-medium truncate">{device.deviceName}</div>
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
	);
}
