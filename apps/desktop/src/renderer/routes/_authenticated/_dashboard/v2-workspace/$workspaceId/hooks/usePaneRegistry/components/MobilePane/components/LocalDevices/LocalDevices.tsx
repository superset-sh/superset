import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { workspaceTrpc } from "@superset/workspace-client";
import { useState } from "react";
import { DevicePicker, type LocalDevice } from "./components/DevicePicker";
import { DeviceSession } from "./components/DeviceSession";
import { PaneMessage } from "./components/PaneMessage";

const deviceKey = (device: LocalDevice) => `${device.platform}:${device.name}`;

export function LocalDevices() {
	const devicesQuery = workspaceTrpc.mobile.localDevices.useQuery(undefined, {
		refetchInterval: 3000,
	});
	const boot = workspaceTrpc.mobile.bootLocalDevice.useMutation({
		onSettled: () => devicesQuery.refetch(),
	});
	const shutdown = workspaceTrpc.mobile.shutdownLocalDevice.useMutation({
		onSettled: () => devicesQuery.refetch(),
	});
	const [selectedKey, setSelectedKey] = useState<string | null>(null);

	if (devicesQuery.isPending) {
		return (
			<PaneMessage>
				<Trans>Starting the simulator…</Trans>
			</PaneMessage>
		);
	}
	if (devicesQuery.isError) {
		return (
			<PaneMessage>
				<Trans>Could not reach a mobile simulator.</Trans>
				<div className="mt-2 text-xs opacity-70">
					{errorMessage(devicesQuery.error)}
				</div>
				<Button
					variant="outline"
					size="sm"
					className="mt-3"
					onClick={() => devicesQuery.refetch()}
				>
					<Trans>Retry</Trans>
				</Button>
			</PaneMessage>
		);
	}

	const { hubUrl, devices } = devicesQuery.data;
	const selected =
		devices.find((device) => deviceKey(device) === selectedKey) ??
		devices.find((device) => device.booted) ??
		null;

	const select = (device: LocalDevice) => {
		setSelectedKey(deviceKey(device));
		if (!device.booted) boot.mutate(device);
	};

	const picker = (
		<DevicePicker
			devices={devices}
			selected={selected}
			onSelect={select}
			onShutdown={() => {
				if (!selected) return;
				setSelectedKey(null);
				shutdown.mutate(selected);
			}}
		/>
	);

	if (selected?.booted) {
		return (
			<DeviceSession
				key={`${deviceKey(selected)}:${selected.id}`}
				hubUrl={hubUrl}
				device={selected}
				picker={picker}
			/>
		);
	}

	return (
		<div className="relative flex size-full flex-col">
			{picker}
			<PaneMessage>
				{selected ? (
					<Trans>Booting {selected.name}…</Trans>
				) : (
					<Trans>No device is running.</Trans>
				)}
				{boot.error && (
					<div className="mt-2 text-xs opacity-70">
						{errorMessage(boot.error)}
					</div>
				)}
			</PaneMessage>
		</div>
	);
}
