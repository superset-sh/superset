import { LuOctagonX } from "react-icons/lu";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";

interface DashboardSidebarStopAllAgentsButtonProps {
	/** Opens the confirm dialog — this row never kills anything by itself. */
	onRequestStopAll: () => void;
	disabled?: boolean;
}

/**
 * Footer row of the agents card. It sits well clear of the agent list, reads
 * as destructive, and only asks for the stop — the confirm dialog owns the
 * irreversible part, so it advertises `aria-haspopup="dialog"`.
 */
export function DashboardSidebarStopAllAgentsButton({
	onRequestStopAll,
	disabled,
}: DashboardSidebarStopAllAgentsButtonProps) {
	return (
		<button
			type="button"
			onClick={onRequestStopAll}
			disabled={disabled}
			aria-haspopup="dialog"
			className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive disabled:opacity-70"
		>
			<LuOctagonX className="size-3 shrink-0" strokeWidth={STROKE_WIDTH} />
			Stop all agents…
		</button>
	);
}
