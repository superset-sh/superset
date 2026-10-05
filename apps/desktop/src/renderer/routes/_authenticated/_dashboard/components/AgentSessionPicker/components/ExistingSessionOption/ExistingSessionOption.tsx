import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";

export function ExistingSessionOption({
	binding,
	sessionTitle,
	compact = false,
}: {
	binding: TerminalAgentBinding;
	sessionTitle?: string | null;
	compact?: boolean;
}) {
	const iconSrc = usePresetIcon(binding.agentId);
	const name = sessionTitle?.trim();
	return (
		<span className="inline-flex min-w-0 items-center gap-2">
			{iconSrc ? (
				<img
					src={iconSrc}
					alt=""
					className="size-3.5 shrink-0"
					draggable={false}
				/>
			) : null}
			<span className="truncate" title={name || binding.agentId}>
				{name || binding.agentId}
			</span>
			{!compact && !name && (
				<span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
					· {binding.terminalId.slice(0, 6)}
				</span>
			)}
		</span>
	);
}
