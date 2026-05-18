import { getPresetById } from "@superset/shared/host-agent-presets";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { getPresetIcon } from "@superset/ui/icons/preset-icons";
import { useNavigate } from "@tanstack/react-router";
import { HiCheck } from "react-icons/hi2";
import { LuCpu, LuSettings } from "react-icons/lu";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";

interface AgentPickerProps {
	hostId: string | null | undefined;
	value: string;
	onChange: (next: string) => void;
	className?: string;
}

export function AgentPicker({
	hostId,
	value,
	onChange,
	className,
}: AgentPickerProps) {
	const navigate = useNavigate();
	const hostUrl = useHostUrl(hostId);
	const { agents } = useV2AgentChoices(hostUrl);
	const isDark = useIsDarkTheme();
	const hostMatch = agents.find((agent) => agent.id === value);
	const presetMatch = hostMatch ? null : getPresetById(value);
	const selectedLabel =
		hostMatch?.label ?? presetMatch?.label ?? (value ? value : null);
	const selectedIconKey = hostMatch?.iconId ?? presetMatch?.presetId ?? value;
	const selectedIcon = selectedIconKey
		? getPresetIcon(selectedIconKey, isDark)
		: null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<PickerTrigger
					className={className}
					icon={
						selectedIcon ? (
							<img
								src={selectedIcon}
								alt=""
								className="size-3.5 shrink-0 object-contain"
							/>
						) : (
							<LuCpu className="size-4 shrink-0" />
						)
					}
					label={selectedLabel ?? "Select agent"}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{agents.map((agent) => {
					const icon = getPresetIcon(agent.iconId ?? agent.id, isDark);
					return (
						<DropdownMenuItem
							key={agent.id}
							onSelect={() => onChange(agent.id)}
						>
							{icon ? (
								<img
									src={icon}
									alt=""
									className="size-3.5 shrink-0 object-contain"
								/>
							) : (
								<LuCpu className="size-4 shrink-0" />
							)}
							<span className="flex-1 truncate">{agent.label}</span>
							{value === agent.id && <HiCheck className="size-4" />}
						</DropdownMenuItem>
					);
				})}
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={() => navigate({ to: "/settings/agents" })}>
					<LuSettings className="size-4 shrink-0" />
					<span className="flex-1">Configure agents…</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
