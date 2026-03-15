import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useState } from "react";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface DevicePickerProps {
	selectedDeviceId: string | null;
	onSelectDevice: (id: string | null) => void;
}

export function DevicePicker({
	selectedDeviceId,
	onSelectDevice,
}: DevicePickerProps) {
	const [open, setOpen] = useState(false);
	const collections = useCollections();
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();

	const { data: allDevices } = useLiveQuery(
		(q) =>
			q
				.from({ devices: collections.v2Devices })
				.select(({ devices }) => ({ ...devices })),
		[collections],
	);

	const { data: userDeviceLinks } = useLiveQuery(
		(q) =>
			q
				.from({ ud: collections.v2UsersDevices })
				.select(({ ud }) => ({ ...ud })),
		[collections],
	);

	const localHostDevice = useMemo(() => {
		if (!allDevices || !deviceInfo) return null;
		return (
			allDevices.find(
				(d) => d.type === "host" && d.clientId === deviceInfo.deviceId,
			) ?? null
		);
	}, [allDevices, deviceInfo]);

	const accessibleDeviceIds = useMemo(() => {
		if (!userDeviceLinks) return new Set<string>();
		return new Set(userDeviceLinks.map((link) => link.deviceId));
	}, [userDeviceLinks]);

	const otherDevices = useMemo(() => {
		if (!allDevices) return [];
		return allDevices.filter(
			(d) => d.id !== localHostDevice?.id && accessibleDeviceIds.has(d.id),
		);
	}, [allDevices, localHostDevice, accessibleDeviceIds]);

	// Auto-default to local device when it becomes available
	useEffect(() => {
		if (!selectedDeviceId && localHostDevice?.id) {
			onSelectDevice(localHostDevice.id);
		}
	}, [selectedDeviceId, localHostDevice?.id, onSelectDevice]);

	const selectedLabel = useMemo(() => {
		if (!selectedDeviceId || selectedDeviceId === localHostDevice?.id) {
			return "This device";
		}
		const device = otherDevices.find((d) => d.id === selectedDeviceId);
		return device?.name ?? "Select device";
	}, [selectedDeviceId, localHostDevice, otherDevices]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
					<span className="truncate max-w-[140px]">{selectedLabel}</span>
					<HiChevronUpDown className="size-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-52 p-0">
				<Command>
					<CommandList>
						<CommandEmpty>No devices found.</CommandEmpty>
						<CommandGroup>
							<CommandItem
								value="This device"
								onSelect={() => {
									onSelectDevice(localHostDevice?.id ?? null);
									setOpen(false);
								}}
							>
								This device
								{localHostDevice ? ` (${localHostDevice.name})` : ""}
								{(!selectedDeviceId ||
									selectedDeviceId === localHostDevice?.id) && (
									<HiCheck className="ml-auto size-4" />
								)}
							</CommandItem>
							{otherDevices.map((device) => (
								<CommandItem
									key={device.id}
									value={device.name}
									onSelect={() => {
										onSelectDevice(device.id);
										setOpen(false);
									}}
								>
									{device.name}
									{device.id === selectedDeviceId && (
										<HiCheck className="ml-auto size-4" />
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
