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
import {
	HiCheck,
	HiChevronUpDown,
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
}

function getSelectedLabel(
	hostId: string | null,
	machineId: string | null,
	currentDeviceName: string | null,
	otherHosts: WorkspaceHostOption[],
) {
	if (hostId === null || hostId === machineId) {
		return currentDeviceName ?? "Local Device";
	}
	return otherHosts.find((host) => host.id === hostId)?.name ?? "Unknown Host";
}

function getSelectedIcon(hostId: string | null, machineId: string | null) {
	if (hostId === null || hostId === machineId) {
		return <HiOutlineComputerDesktop className="size-4 shrink-0" />;
	}
	return <HiOutlineServer className="size-4 shrink-0" />;
}

export function DevicePicker({
	hostId,
	onSelectHostId,
	className,
}: DevicePickerProps) {
	const { machineId } = useLocalHostService();
	const { currentDeviceName, otherHosts } = useWorkspaceHostOptions();
	const isLocal = hostId === null || hostId === machineId;
	const selectedLabel = getSelectedLabel(
		hostId,
		machineId,
		currentDeviceName,
		otherHosts,
	);
	// Only remote hosts have a meaningful online indicator — the app itself
	// is the local host, so it's tautologically online.
	const selectedRemoteOnline = isLocal
		? null
		: (otherHosts.find((host) => host.id === hostId)?.isOnline ?? false);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<FormPickerTrigger
					className={cn("max-w-[140px]", className)}
					aria-label={`Device: ${selectedLabel}`}
					title={selectedLabel}
				>
					{getSelectedIcon(hostId, machineId)}
					<span className="truncate">{selectedLabel}</span>
					{selectedRemoteOnline !== null && (
						<OnlineDot online={selectedRemoteOnline} />
					)}
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				<DropdownMenuItem onSelect={() => onSelectHostId(machineId)}>
					<HiOutlineComputerDesktop className="size-4" />
					<span className="flex-1">Local Device</span>
					{isLocal && <HiCheck className="size-4" />}
				</DropdownMenuItem>
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
