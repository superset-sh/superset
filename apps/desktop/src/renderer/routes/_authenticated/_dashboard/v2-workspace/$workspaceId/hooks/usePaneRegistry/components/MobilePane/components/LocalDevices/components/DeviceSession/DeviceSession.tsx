import { useActiveDeviceClient } from "@expo/hub-client";
import { workspaceTrpc } from "@superset/workspace-client";
import type { ReactNode } from "react";
import { DeviceView } from "../../../DeviceView";
import type { LocalDevice } from "../DevicePicker";

interface DeviceSessionProps {
	hubUrl: string;
	device: LocalDevice;
	picker: ReactNode;
}

export function DeviceSession({ hubUrl, device, picker }: DeviceSessionProps) {
	const client = useActiveDeviceClient(
		{
			platform: device.platform,
			device: device.id,
			streamMode: device.platform === "ios" ? "mjpeg" : "h264",
		},
		hubUrl,
	);
	const rotateDevice = workspaceTrpc.mobile.rotateLocalDevice.useMutation();
	const utils = workspaceTrpc.useUtils();
	const restartHub = workspaceTrpc.mobile.restartLocalHub.useMutation({
		onSettled: () => utils.mobile.localDevices.invalidate(),
	});
	const deviceQuery = `device=${encodeURIComponent(device.id)}`;

	return (
		<DeviceView
			client={client}
			deviceName={device.name}
			picker={picker}
			logStreamUrl={(scope) =>
				device.platform === "ios"
					? `${hubUrl}/vendor/serve-sim/logs?${deviceQuery}${scope === "app" ? "&scope=user-apps" : ""}`
					: `${hubUrl}/vendor/serve-emu/api/logcat?${deviceQuery}`
			}
			onRotate={(orientation) =>
				rotateDevice.mutate({
					platform: device.platform,
					id: device.id,
					orientation,
				})
			}
			onReconnect={() => restartHub.mutate()}
			reconnecting={restartHub.isPending}
		/>
	);
}
