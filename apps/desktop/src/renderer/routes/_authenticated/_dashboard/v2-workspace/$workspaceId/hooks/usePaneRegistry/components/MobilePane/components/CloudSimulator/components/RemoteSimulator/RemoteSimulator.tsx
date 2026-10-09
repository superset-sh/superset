import { useIosDeviceClient } from "@expo/hub-client";
import type { ReactNode } from "react";
import { DeviceView } from "../../../DeviceView";
import { sendOrientation } from "./utils/sendOrientation";

export interface RemoteSimulatorSession {
	baseUrl: string;
	token: string;
	deviceId: string;
}

interface RemoteSimulatorProps {
	session: RemoteSimulatorSession;
	deviceName: string;
	picker: ReactNode;
}

export function RemoteSimulator({
	session,
	deviceName,
	picker,
}: RemoteSimulatorProps) {
	const { baseUrl, token, deviceId } = session;
	const client = useIosDeviceClient({
		baseUrl,
		device: deviceId,
		streamMode: "webrtc",
		token,
	});

	return (
		<DeviceView
			client={client}
			deviceName={deviceName}
			picker={picker}
			logStreamUrl={(scope) => {
				const url = new URL(`${baseUrl}/logs`);
				url.searchParams.set("device", deviceId);
				url.searchParams.set("token", token);
				if (scope === "app") url.searchParams.set("scope", "user-apps");
				return url.toString();
			}}
			onRotate={(orientation) =>
				sendOrientation({
					baseUrl,
					token,
					deviceId,
					orientation:
						orientation === "portrait" ? "portrait" : "landscape_left",
				})
			}
		/>
	);
}
