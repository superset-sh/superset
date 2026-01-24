import { useCallback, useEffect, useState } from "react";
import {
	HiOutlineComputerDesktop,
	HiOutlineDevicePhoneMobile,
	HiOutlineGlobeAlt,
} from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface OnlineDevice {
	id: string;
	deviceId: string;
	deviceName: string;
	deviceType: "desktop" | "mobile" | "web";
	lastSeenAt: Date;
	ownerId: string;
	ownerName: string;
	ownerEmail: string;
}

const DEVICE_ICONS = {
	desktop: HiOutlineComputerDesktop,
	mobile: HiOutlineDevicePhoneMobile,
	web: HiOutlineGlobeAlt,
};

export function DevicesSettings() {
	const [devices, setDevices] = useState<OnlineDevice[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchDevices = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const result = await apiTrpcClient.device.listOnlineDevices.query();
			setDevices(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch devices");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchDevices();
		// Refresh every 10 seconds
		const interval = setInterval(fetchDevices, 10_000);
		return () => clearInterval(interval);
	}, [fetchDevices]);

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
					Devices currently connected to your account. Refreshes every 10
					seconds.
				</p>
			</div>

			{loading && devices.length === 0 && (
				<div className="text-muted-foreground">Loading...</div>
			)}

			{error && (
				<div className="text-red-500 bg-red-500/10 p-3 rounded-md mb-4">
					{error}
				</div>
			)}

			{!loading && devices.length === 0 && !error && (
				<div className="text-muted-foreground">No devices online</div>
			)}

			<div className="space-y-3">
				{devices.map((device) => {
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
									{device.ownerName} &middot; {device.deviceType} &middot;{" "}
									{formatLastSeen(device.lastSeenAt)}
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

			<button
				type="button"
				onClick={fetchDevices}
				className="mt-4 text-sm text-muted-foreground hover:text-foreground underline"
			>
				Refresh now
			</button>
		</div>
	);
}
