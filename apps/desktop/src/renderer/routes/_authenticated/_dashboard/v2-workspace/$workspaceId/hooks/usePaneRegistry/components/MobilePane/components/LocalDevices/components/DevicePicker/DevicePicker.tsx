import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { TbChevronDown } from "react-icons/tb";
import { FloatingBar } from "../FloatingBar";

export interface LocalDevice {
	id: string;
	name: string;
	version: string;
	platform: "ios" | "android";
	booted: boolean;
}

interface DevicePickerProps {
	devices: LocalDevice[];
	selected: LocalDevice | null;
	onSelect: (device: LocalDevice) => void;
	onShutdown?: () => void;
}

function DeviceItems({
	devices,
	onSelect,
}: Pick<DevicePickerProps, "devices" | "onSelect">) {
	return devices.map((device) => (
		<DropdownMenuItem
			key={`${device.platform}:${device.name}`}
			onSelect={() => onSelect(device)}
			className="gap-2"
		>
			<span
				className={`size-1.5 shrink-0 rounded-full ${device.booted ? "bg-green-500" : "bg-muted-foreground/30"}`}
			/>
			<span className="min-w-0 flex-1 truncate">{device.name}</span>
			<span className="shrink-0 text-xs text-muted-foreground">
				{device.version}
			</span>
		</DropdownMenuItem>
	));
}

export function DevicePicker({
	devices,
	selected,
	onSelect,
	onShutdown,
}: DevicePickerProps) {
	const ios = devices.filter((device) => device.platform === "ios");
	const android = devices.filter((device) => device.platform === "android");

	return (
		<FloatingBar className="top-3 left-3 max-w-[calc(100%-7.5rem)]">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="xs"
						className="min-w-0 gap-1.5 font-normal"
					>
						<span className="truncate">
							{selected ? selected.name : <Trans>Choose a device</Trans>}
						</span>
						{selected && (
							<span className="shrink-0 text-muted-foreground">
								{selected.version}
							</span>
						)}
						<TbChevronDown className="size-3 shrink-0 text-muted-foreground" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="max-h-96 w-72">
					{ios.length > 0 && (
						<>
							<DropdownMenuLabel>{"iOS"}</DropdownMenuLabel>
							<DeviceItems devices={ios} onSelect={onSelect} />
						</>
					)}
					{ios.length > 0 && android.length > 0 && <DropdownMenuSeparator />}
					{android.length > 0 && (
						<>
							<DropdownMenuLabel>{"Android"}</DropdownMenuLabel>
							<DeviceItems devices={android} onSelect={onSelect} />
						</>
					)}
					{selected?.booted && onShutdown && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onSelect={onShutdown}>
								<Trans>Shut down {selected.name}</Trans>
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</FloatingBar>
	);
}
