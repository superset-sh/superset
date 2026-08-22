import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect } from "react";
import {
	HiCheck,
	HiChevronUpDown,
	HiOutlineCloud,
	HiOutlineComputerDesktop,
	HiOutlineServer,
} from "react-icons/hi2";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { FormPickerTrigger } from "../../PromptGroup/components/FormPickerTrigger";
import {
	useWorkspaceHostOptions,
	type WorkspaceHostOption,
} from "./hooks/useWorkspaceHostOptions";

function OnlineDot({ online }: { online: boolean }) {
	return (
		<span
			role="img"
			aria-label={online ? "online" : "offline"}
			className={cn(
				"inline-block size-1.5 shrink-0 rounded-full",
				online ? "bg-emerald-500" : "bg-muted-foreground/60",
			)}
		/>
	);
}

interface DevicePickerProps {
	hostId: string | null;
	onSelectHostId: (hostId: string | null) => void;
	className?: string;
	/**
	 * Also show relay connectivity for the local device. Cloud-dispatched work
	 * (automations) goes through the relay, so "local" is not inherently online.
	 */
	showLocalOnlineState?: boolean;
	/**
	 * Disables opening via the Radix trigger itself. A button disabled only
	 * through an enclosing <fieldset> still receives pointerdown in Chrome —
	 * the event that opens a DropdownMenu.
	 */
	disabled?: boolean;
}

/**
 * Sentinel host id for "run this in a cloud sandbox". Not a machine id: a
 * sandbox is created per workspace and has no host row to point at.
 */
export const CLOUD_HOST_ID = "cloud";

function getSelectedLabel(
	hostId: string | null,
	machineId: string | null,
	currentDeviceName: string | null,
	otherHosts: WorkspaceHostOption[],
) {
	if (hostId === CLOUD_HOST_ID) return "Cloud";
	if (hostId === null || hostId === machineId) {
		return currentDeviceName ?? "Local Device";
	}
	return otherHosts.find((host) => host.id === hostId)?.name ?? "Unknown Host";
}

function getSelectedIcon(hostId: string | null, machineId: string | null) {
	if (hostId === CLOUD_HOST_ID) {
		return <HiOutlineCloud className="size-4 shrink-0" />;
	}
	if (hostId === null || hostId === machineId) {
		return <HiOutlineComputerDesktop className="size-4 shrink-0" />;
	}
	return <HiOutlineServer className="size-4 shrink-0" />;
}

export function DevicePicker({
	hostId,
	onSelectHostId,
	className,
	showLocalOnlineState = false,
	disabled,
}: DevicePickerProps) {
	const { machineId } = useLocalHostService();
	const cloudEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const { currentDeviceName, localHostIsOnline, otherHosts } =
		useWorkspaceHostOptions();
	// A remembered cloud target outlives the flag that offers it, and the menu
	// then has no cloud entry to point at what the trigger claims is selected.
	// Undefined means the flags haven't resolved, which is not a "no".
	useEffect(() => {
		if (hostId === CLOUD_HOST_ID && cloudEnabled === false) {
			onSelectHostId(machineId);
		}
	}, [cloudEnabled, hostId, machineId, onSelectHostId]);
	const isLocal = hostId === null || hostId === machineId;
	const selectedLabel = getSelectedLabel(
		hostId,
		machineId,
		currentDeviceName,
		otherHosts,
	);
	// For direct (local) use the app itself is the host, so it's tautologically
	// online and gets no indicator. Relay-dispatched contexts opt into showing
	// the local device's relay connectivity instead.
	const localOnline = showLocalOnlineState ? localHostIsOnline : null;
	const isCloud = hostId === CLOUD_HOST_ID;
	const selectedOnline = isLocal
		? localOnline
		: isCloud
			? null
			: (otherHosts.find((host) => host.id === hostId)?.isOnline ?? false);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<FormPickerTrigger
					className={cn("max-w-[140px]", className)}
					aria-label={`Device: ${selectedLabel}`}
					title={selectedLabel}
				>
					{getSelectedIcon(hostId, machineId)}
					<span className="truncate">{selectedLabel}</span>
					{selectedOnline !== null && <OnlineDot online={selectedOnline} />}
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				<DropdownMenuItem onSelect={() => onSelectHostId(machineId)}>
					<HiOutlineComputerDesktop className="size-4" />
					<span className="flex-1">Local Device</span>
					{localOnline !== null && <OnlineDot online={localOnline} />}
					{isLocal && <HiCheck className="size-4" />}
				</DropdownMenuItem>
				{cloudEnabled && (
					<DropdownMenuItem onSelect={() => onSelectHostId(CLOUD_HOST_ID)}>
						<HiOutlineCloud className="size-4" />
						<span className="flex-1">Cloud</span>
						{hostId === CLOUD_HOST_ID && <HiCheck className="size-4" />}
					</DropdownMenuItem>
				)}
				{otherHosts.length > 0 && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<HiOutlineServer className="size-4" />
								Other Hosts
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent className="w-72">
								{otherHosts.map((host) => {
									const isSelected = hostId === host.id;

									return (
										<DropdownMenuItem
											key={host.id}
											onSelect={() => onSelectHostId(host.id)}
										>
											<HiOutlineServer className="size-4" />
											<span className="min-w-0 truncate">{host.name}</span>
											<OnlineDot online={host.isOnline} />
											{isSelected && (
												<HiCheck className="ml-auto size-4 shrink-0" />
											)}
										</DropdownMenuItem>
									);
								})}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
