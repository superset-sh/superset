import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useNavigate } from "@tanstack/react-router";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import type {
	AgentDefinitionId,
	ResolvedAgentConfig,
} from "shared/utils/agent-settings";

const CONFIGURE_AGENTS_VALUE = "__configure_agents__";

interface AgentSelectProps<T extends string> {
	agents: ResolvedAgentConfig[];
	value?: T;
	placeholder: string;
	onValueChange: (value: T) => void;
	onBeforeConfigureAgents?: () => void;
	disabled?: boolean;
	triggerClassName?: string;
	contentClassName?: string;
	iconClassName?: string;
	allowNone?: boolean;
	noneLabel?: string;
	noneValue?: T;
}

export function AgentSelect<T extends string>({
	agents,
	value,
	placeholder,
	onValueChange,
	onBeforeConfigureAgents,
	disabled,
	triggerClassName,
	contentClassName,
	iconClassName = "size-3.5 object-contain",
	allowNone = false,
	noneLabel = "No agent",
	noneValue,
}: AgentSelectProps<T>) {
	const navigate = useNavigate();
	const isDark = useIsDarkTheme();
	const selectableIds = new Set<AgentDefinitionId>(
		agents.map((agent) => agent.id),
	);
	const selectedValue =
		value != null &&
		((allowNone && value === noneValue) ||
			selectableIds.has(value as AgentDefinitionId))
			? value
			: undefined;
	const showSeparator = (allowNone || agents.length > 0) && !disabled;

	const handleValueChange = (nextValue: string) => {
		if (nextValue === CONFIGURE_AGENTS_VALUE) {
			onBeforeConfigureAgents?.();
			void navigate({ to: "/settings/agents" });
			return;
		}

		onValueChange(nextValue as T);
	};

	return (
		<Select
			value={selectedValue}
			onValueChange={handleValueChange}
			disabled={disabled}
		>
			<SelectTrigger className={triggerClassName}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent className={contentClassName}>
				{allowNone && noneValue != null && (
					<SelectItem value={noneValue}>{noneLabel}</SelectItem>
				)}
				{agents.map((agent) => {
					const icon = getPresetIcon(agent.id, isDark);
					return (
						<SelectItem key={agent.id} value={agent.id}>
							<span className="flex items-center gap-2">
								{icon && <img src={icon} alt="" className={iconClassName} />}
								{agent.label}
							</span>
						</SelectItem>
					);
				})}
				{showSeparator && <SelectSeparator />}
				<SelectItem value={CONFIGURE_AGENTS_VALUE}>
					Configure agents...
				</SelectItem>
			</SelectContent>
		</Select>
	);
}
