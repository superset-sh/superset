import {
	DeviceScreen,
	displayScreen,
	useActiveDeviceClient,
} from "@expo/hub-client";
import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { type ReactNode, useEffect, useState } from "react";
import { DeviceActions } from "../DeviceActions";
import { DeviceControls } from "../DeviceControls";
import type { LocalDevice } from "../DevicePicker";
import { LogsDrawer } from "../LogsDrawer";
import { ToolsPanel } from "../ToolsPanel";

interface DeviceSessionProps {
	hubUrl: string;
	device: LocalDevice;
	picker: ReactNode;
}

const FALLBACK_ASPECT_RATIO = 9 / 19.5;
const STALLED_AFTER_MS = 10_000;

export function DeviceSession({ hubUrl, device, picker }: DeviceSessionProps) {
	const client = useActiveDeviceClient(
		{
			platform: device.platform,
			device: device.id,
			streamMode: device.platform === "ios" ? "mjpeg" : "h264",
		},
		hubUrl,
	);
	const screen = displayScreen(client.screen);
	const aspectRatio = screen
		? screen.width / screen.height
		: FALLBACK_ASPECT_RATIO;

	// An app that is locked to portrait keeps reporting a portrait screen
	// while the device is turned, so the last request decides the next one.
	const [requestedLandscape, setRequestedLandscape] = useState<boolean | null>(
		null,
	);
	const rotateDevice = workspaceTrpc.mobile.rotateLocalDevice.useMutation();
	const rotate = () => {
		const landscape = !(requestedLandscape ?? aspectRatio > 1);
		setRequestedLandscape(landscape);
		rotateDevice.mutate({
			platform: device.platform,
			id: device.id,
			orientation: landscape ? "landscape" : "portrait",
		});
	};

	const utils = workspaceTrpc.useUtils();
	const restartHub = workspaceTrpc.mobile.restartLocalHub.useMutation({
		onSettled: () => utils.mobile.localDevices.invalidate(),
	});
	const [stalled, setStalled] = useState(false);
	useEffect(() => {
		setStalled(false);
		if (client.status === "streaming") return;
		const timer = setTimeout(() => setStalled(true), STALLED_AFTER_MS);
		return () => clearTimeout(timer);
	}, [client.status]);

	const [expanded, setExpanded] = useState(false);
	const [toolsOpen, setToolsOpen] = useState(false);
	const [logsOpen, setLogsOpen] = useState(false);

	useEffect(() => {
		if (!expanded) return;
		const exitOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setExpanded(false);
		};
		window.addEventListener("keydown", exitOnEscape, true);
		return () => window.removeEventListener("keydown", exitOnEscape, true);
	}, [expanded]);

	return (
		<div className="flex size-full flex-col bg-background">
			<div className="relative flex min-h-0 flex-1 flex-col">
				{!expanded && picker}
				<DeviceActions
					expanded={expanded}
					onToggleExpanded={() => setExpanded((value) => !value)}
					onToggleTools={() => setToolsOpen((value) => !value)}
					onToggleLogs={() => setLogsOpen((value) => !value)}
				/>
				{!expanded && (
					<DeviceControls
						client={client}
						deviceName={device.name}
						onRotate={rotate}
					/>
				)}
				{!expanded && toolsOpen && (
					<ToolsPanel client={client} onClose={() => setToolsOpen(false)} />
				)}
				{!expanded && logsOpen && (
					<LogsDrawer
						hubUrl={hubUrl}
						platform={device.platform}
						deviceId={device.id}
						deviceName={device.name}
						onClose={() => setLogsOpen(false)}
					/>
				)}
				<div
					className={cn(
						"flex min-h-0 flex-1 items-center justify-center",
						expanded ? "m-1" : "mx-3 mt-14 mb-16",
					)}
					style={{ containerType: "size" }}
				>
					<div
						className="relative"
						style={{
							aspectRatio,
							width:
								aspectRatio > 1
									? "min(100cqw, 100cqh)"
									: `min(100cqw, calc(100cqh * ${aspectRatio}))`,
						}}
					>
						<DeviceScreen client={client} borderRadius={20} />
						{stalled && (
							<div className="absolute inset-0 flex items-center justify-center">
								<Button
									variant="outline"
									size="sm"
									className="mt-16"
									disabled={restartHub.isPending}
									onClick={() => restartHub.mutate()}
								>
									<Trans>Reconnect</Trans>
								</Button>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
