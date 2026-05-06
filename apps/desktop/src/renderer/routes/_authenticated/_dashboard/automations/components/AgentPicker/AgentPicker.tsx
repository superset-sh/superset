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
import {
	useIsDarkTheme,
	usePresetIcon,
} from "renderer/assets/app-icons/preset-icons";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import { useEnabledAgents } from "renderer/hooks/useEnabledAgents";

interface AgentPickerProps {
	value: string;
	onChange: (next: string) => void;
	className?: string;
}

export function AgentPicker({ value, onChange, className }: AgentPickerProps) {
	const navigate = useNavigate();
	const { agents } = useEnabledAgents();
	const isDark = useIsDarkTheme();
	const selectedAgent = agents.find((agent) => agent.id === value);
	const selectedIcon = usePresetIcon(value);

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
					label={selectedAgent?.label ?? "Select agent"}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{agents.map((agent) => {
					const icon = getPresetIcon(agent.id, isDark);
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
