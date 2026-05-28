import type { HostAgentConfig } from "@superset/host-service/settings";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { cn } from "@superset/ui/utils";
import { LuPlus } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { EXISTING_PREFIX, NEW_PREFIX } from "../../hooks/useDiffCommentTarget";

interface AgentPickerSelectProps {
	value: string | null;
	onValueChange: (next: string) => void;
	sessions: TerminalAgentBinding[];
	configs: HostAgentConfig[];
}

export function AgentPickerSelect({
	value,
	onValueChange,
	sessions,
	configs,
}: AgentPickerSelectProps) {
	return (
		<Select value={value ?? undefined} onValueChange={onValueChange}>
			<SelectTrigger
				size="sm"
				className={cn(
					"h-7 min-w-40 gap-1.5 border-border/60 bg-popover px-2 text-[11px]",
					"hover:bg-accent/50",
				)}
			>
				<SelectValue placeholder="Choose agent" />
			</SelectTrigger>
			<SelectContent align="start" className="min-w-60">
				{sessions.length > 0 ? (
					<SelectGroup>
						<SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
							Active sessions
						</SelectLabel>
						{sessions.map((session) => (
							<SelectItem
								key={session.terminalId}
								value={`${EXISTING_PREFIX}${session.terminalId}`}
								className="text-[12px]"
							>
								<ExistingSessionOption binding={session} />
							</SelectItem>
						))}
					</SelectGroup>
				) : null}
				{sessions.length > 0 && configs.length > 0 ? <SelectSeparator /> : null}
				{configs.length > 0 ? (
					<SelectGroup>
						<SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
							Start new session
						</SelectLabel>
						{configs.map((config) => (
							<SelectItem
								key={config.id}
								value={`${NEW_PREFIX}${config.id}`}
								className="text-[12px]"
							>
								<NewSessionOption
									label={config.label}
									presetId={config.presetId}
								/>
							</SelectItem>
						))}
					</SelectGroup>
				) : null}
			</SelectContent>
		</Select>
	);
}

function ExistingSessionOption({ binding }: { binding: TerminalAgentBinding }) {
	const iconSrc = usePresetIcon(binding.agentId);
	return (
		<span className="inline-flex items-center gap-1.5">
			{iconSrc ? (
				<img
					src={iconSrc}
					alt=""
					className="size-3 shrink-0"
					draggable={false}
				/>
			) : null}
			<span>{binding.agentId}</span>
			<span className="text-muted-foreground/70">
				· {binding.terminalId.slice(0, 6)}
			</span>
		</span>
	);
}

function NewSessionOption({
	label,
	presetId,
}: {
	label: string;
	presetId: string;
}) {
	const iconSrc = usePresetIcon(presetId);
	return (
		<span className="inline-flex items-center gap-1.5">
			{iconSrc ? (
				<img
					src={iconSrc}
					alt=""
					className="size-3 shrink-0"
					draggable={false}
				/>
			) : (
				<LuPlus className="size-3 text-muted-foreground" />
			)}
			<span>{label}</span>
		</span>
	);
}
