import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { TerminalPaneData } from "../../../../../../types";
import { useAgentSurface } from "../../hooks/useAgentSurface";
import type {
	AgentIdentity,
	AgentSurface,
} from "../../hooks/useAgentSurfaceSwitch";

/**
 * Switches an agent terminal between its two surfaces. Hidden for anything the
 * ACP adapters can't run, and reads the same derived surface the pane renders
 * so the highlight can never disagree with what is on screen.
 */
export function AgentSurfaceToggle({
	data,
	onChange,
	workspaceId,
}: {
	workspaceId: string;
	data: TerminalPaneData;
	onChange: (surface: AgentSurface, agent: AgentIdentity | undefined) => void;
}) {
	const { t } = useLingui();
	const { agent, surface, switchable } = useAgentSurface(workspaceId, data);

	if (!switchable) return null;

	return (
		<div className="flex items-center gap-px">
			<SurfaceButton
				active={surface === "cli"}
				label={t({ message: "CLI" })}
				onClick={() => onChange("cli", agent)}
			/>
			<SurfaceButton
				active={surface === "acp"}
				label={t({ message: "Chat" })}
				onClick={() => onChange("acp", agent)}
			/>
		</div>
	);
}

function SurfaceButton({
	active,
	label,
	onClick,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			aria-pressed={active}
			className={cn(
				"rounded px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide transition-colors",
				active
					? "bg-secondary text-foreground"
					: "text-muted-foreground/60 hover:bg-secondary/60 hover:text-foreground",
			)}
			onClick={onClick}
			type="button"
		>
			{label}
		</button>
	);
}
