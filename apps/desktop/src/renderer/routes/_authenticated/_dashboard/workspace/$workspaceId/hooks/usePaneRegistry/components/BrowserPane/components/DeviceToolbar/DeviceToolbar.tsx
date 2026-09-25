import { useLingui } from "@lingui/react/macro";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { RefreshCwIcon, XIcon } from "lucide-react";
import { DEFAULT_DEVICE_PRESET, DEVICE_PRESETS } from "../../constants";
import type { DeviceToolbarState } from "../../deviceToolbarStore";

interface DeviceToolbarProps {
	state: DeviceToolbarState;
	onSetDevice: (deviceId: string) => void;
	onToggleRotate: () => void;
	onClose: () => void;
}

/** The control strip shown above the page while the device toolbar is active. */
export function DeviceToolbar({
	state,
	onSetDevice,
	onToggleRotate,
	onClose,
}: DeviceToolbarProps) {
	const { t } = useLingui();
	const device =
		DEVICE_PRESETS.find((d) => d.id === state.deviceId) ??
		DEFAULT_DEVICE_PRESET;
	const size = state.isRotated
		? { width: device.height, height: device.width }
		: { width: device.width, height: device.height };

	return (
		// relative z-20: stay above the blank-page/error inset-0 z-10 overlays.
		<div className="relative z-20 flex shrink-0 items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-foreground/90">
			<Select value={state.deviceId} onValueChange={onSetDevice}>
				<SelectTrigger size="sm" className="h-6 gap-1.5 px-2 text-xs">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{DEVICE_PRESETS.map((preset) => (
						<SelectItem key={preset.id} value={preset.id} className="text-xs">
							{preset.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<span className="tabular-nums text-muted-foreground/70">
				{size.width} × {size.height}
			</span>
			<button
				type="button"
				onClick={onToggleRotate}
				aria-label={t({
					message: "Rotate device",
				})}
				className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
			>
				<RefreshCwIcon
					className={state.isRotated ? "size-3.5 rotate-90" : "size-3.5"}
				/>
			</button>
			<div className="flex-1" />
			<button
				type="button"
				onClick={onClose}
				aria-label={t({
					message: "Exit device toolbar",
				})}
				className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
			>
				<XIcon className="size-3.5" />
			</button>
		</div>
	);
}
