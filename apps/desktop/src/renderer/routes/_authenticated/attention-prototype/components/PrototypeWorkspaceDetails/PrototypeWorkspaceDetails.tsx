import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { cn } from "@superset/ui/utils";
import type { CSSProperties } from "react";
import { LuRadioTower, LuX } from "react-icons/lu";
import { DashboardSidebarWorkspaceDetailsAction } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components/DashboardSidebarWorkspaceDetails/components/DashboardSidebarWorkspaceDetailsAction";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import type { PrototypeWorkspace } from "../../model/types";
import { usePrototypeStore } from "../../store/usePrototypeStore";
import { PrototypePortBadge } from "../PrototypePortBadge/PrototypePortBadge";

/**
 * Unfold wrapper copied from the real DashboardSidebarWorkspaceDetails: the
 * element's max-width/margin/opacity animate from zero when the row enters its
 * `details-expanded` state (hover/focus of the `.group/item` row scope).
 */
const UNFOLD_WRAPPER = cn(
	"invisible max-w-0 shrink-0 overflow-hidden opacity-0",
	"transition-[max-width,margin,opacity,visibility] duration-500 ease-out motion-reduce:transition-none",
	"details-expanded:visible details-expanded:ml-1.5 details-expanded:opacity-100 details-expanded:duration-200",
);

const MAX_STAGGERED_PORTS = 8;
const STAGGER_STEP_MS = 25;

interface PrototypeWorkspaceDetailsProps {
	workspace: PrototypeWorkspace;
	/** Selects the workspace when the strip's empty area is clicked. */
	onClick?: () => void;
}

/**
 * Fixture-driven copy of the real inline ports strip: a compact port-count
 * pill at rest that unfolds into individual port badges (with stagger) while
 * the row is hovered, plus a "close all" action when there are several.
 */
export function PrototypeWorkspaceDetails({
	workspace,
	onClick,
}: PrototypeWorkspaceDetailsProps) {
	const setActiveWorkspace = usePrototypeStore((s) => s.setActiveWorkspace);
	const closePort = usePrototypeStore((s) => s.closePort);
	const ports = workspace.ports;

	if (ports.length === 0) return null;

	return (
		// Stop pointer/touch starts from bubbling to the sortable wrapper's drag
		// listeners, so scrolling overflowing badges or pressing a badge control
		// isn't captured as a workspace-reorder gesture. Clicks are handled here
		// (not bubbled): badges keep their own actions, but a click on the
		// strip's empty area selects the workspace — the row's own onClick never
		// sees these because mousedown is stopped above it.
		<OverflowFadeContainer
			observeChildren
			// 30px + the row's own pl-5 aligns the strip with the title at 50px,
			// matching the real details strip's pl-[50px].
			className="group/details flex h-[22px] cursor-pointer items-center overflow-x-auto pl-[30px] hide-scrollbar"
			onMouseDown={(event) => event.stopPropagation()}
			onTouchStart={(event) => event.stopPropagation()}
			onClick={(event) => {
				event.stopPropagation();
				if (!onClick) return;
				const target = event.target as HTMLElement;
				// Radix menu selections render in a portal; React bubbling still
				// reaches this handler but the target isn't inside the strip's DOM.
				if (!event.currentTarget.contains(target)) return;
				// Chips handle their own clicks (open port, close, menus); only
				// clicks on the strip's empty area select the workspace. The
				// interactive ancestor must be INSIDE the strip — the enclosing
				// dnd-kit sortable wrapper carries role="button", so an unscoped
				// closest() would match it from anywhere and swallow every click.
				const interactive = target.closest(
					"button, a, [role='button'], [role='menuitem']",
				);
				if (interactive && event.currentTarget.contains(interactive)) return;
				onClick();
			}}
		>
			<span
				className={cn(
					"flex h-[18px] shrink-0 items-center gap-1 overflow-hidden rounded-full bg-muted/60",
					"font-medium text-[9px] text-muted-foreground tabular-nums",
					"max-w-14 px-1.5 opacity-100",
					"transition-[max-width,margin,padding,opacity] duration-500 ease-out motion-reduce:transition-none",
					"details-expanded:ml-0 details-expanded:max-w-0 details-expanded:px-0 details-expanded:opacity-0 details-expanded:duration-200",
				)}
			>
				<LuRadioTower
					className="size-2.5 shrink-0"
					strokeWidth={STROKE_WIDTH}
				/>
				{ports.length}
			</span>

			{ports.map((port, index) => (
				<div
					key={`${workspace.id}:${port.port}`}
					className={cn(
						UNFOLD_WRAPPER,
						"details-expanded:max-w-44 details-expanded:[transition-delay:var(--unfold-delay)]",
					)}
					style={
						{
							"--unfold-delay": `${Math.min(index, MAX_STAGGERED_PORTS) * STAGGER_STEP_MS}ms`,
						} as CSSProperties
					}
				>
					<PrototypePortBadge
						port={port}
						hostType={workspace.hostType}
						onGoToWorkspace={() => setActiveWorkspace(workspace.id)}
						onClose={() => closePort(workspace.id, port.port)}
					/>
				</div>
			))}

			{ports.length > 1 && (
				<div className={cn(UNFOLD_WRAPPER, "details-expanded:max-w-8")}>
					<DashboardSidebarWorkspaceDetailsAction
						label="Close all ports"
						icon={<LuX className="size-3" strokeWidth={STROKE_WIDTH} />}
						onClick={() => {
							for (const port of ports) closePort(workspace.id, port.port);
						}}
					/>
				</div>
			)}
		</OverflowFadeContainer>
	);
}
