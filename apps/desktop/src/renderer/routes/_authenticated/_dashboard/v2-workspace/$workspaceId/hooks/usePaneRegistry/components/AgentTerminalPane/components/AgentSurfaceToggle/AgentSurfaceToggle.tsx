import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { type AgentPane, useAgentSurface } from "../../hooks/useAgentSurface";
import type {
	AgentIdentity,
	AgentSurface,
} from "../../hooks/useAgentSurfaceSwitch";

export function AgentSurfaceToggle({
	pane,
	onChange,
	workspaceId,
}: {
	workspaceId: string;
	pane: AgentPane;
	onChange: (surface: AgentSurface, agent: AgentIdentity | undefined) => void;
}) {
	const { t } = useLingui();
	const { agent, surface, switchable } = useAgentSurface(workspaceId, pane);

	if (!switchable) return null;

	return (
		<div className="flex items-center gap-px">
			<SurfaceButton
				active={surface === "cli"}
				label={t({ message: "CLI" })}
				onClick={() => {
					if (surface !== "cli") onChange("cli", agent);
				}}
			/>
			<SurfaceButton
				active={surface === "acp"}
				label={t({ message: "Chat" })}
				onClick={() => {
					if (surface !== "acp") onChange("acp", agent);
				}}
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
