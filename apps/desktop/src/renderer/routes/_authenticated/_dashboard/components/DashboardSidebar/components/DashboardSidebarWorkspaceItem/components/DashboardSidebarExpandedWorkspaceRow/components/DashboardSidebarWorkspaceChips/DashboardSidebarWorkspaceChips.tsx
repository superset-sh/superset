import { cn } from "@superset/ui/utils";
import type { MouseEventHandler, SyntheticEvent } from "react";
import { useDashboardSidebarWorkspacePorts } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarPortsProvider";
import { useInlineWorkspacePortsEnabled } from "renderer/stores/inline-workspace-ports";
import type { DashboardSidebarWorkspaceIndentation } from "../../../../../../types";
import { DashboardSidebarPortsChip } from "./components/DashboardSidebarPortsChip";

interface DashboardSidebarWorkspaceChipsProps {
	workspaceId: string;
	isInSection?: boolean;
	indentation?: DashboardSidebarWorkspaceIndentation;
	/** Invoked when the strip itself (not one of its chips) is clicked. */
	onClick?: MouseEventHandler<HTMLDivElement>;
}

function stopChipDragStart(event: SyntheticEvent<HTMLDivElement>) {
	if (
		event.target instanceof Element &&
		(!event.currentTarget.contains(event.target) ||
			event.target.closest("button"))
	) {
		event.stopPropagation();
	}
}

/** Activity line beneath a workspace row, left-aligned with the title. */
export function DashboardSidebarWorkspaceChips({
	workspaceId,
	isInSection = false,
	indentation,
	onClick,
}: DashboardSidebarWorkspaceChipsProps) {
	const inlineWorkspacePortsEnabled = useInlineWorkspacePortsEnabled();
	const portGroup = useDashboardSidebarWorkspacePorts(workspaceId);
	const ports = inlineWorkspacePortsEnabled ? (portGroup?.ports ?? []) : [];

	if (ports.length === 0) {
		return null;
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: clicks on the strip's empty area mirror the row click; chips are real buttons
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation lives on the workspace row button; the strip click is a pointer convenience
		<div
			className={cn(
				"flex h-7 items-center gap-1 pr-2",
				indentation === "top-level"
					? "pl-[26px]"
					: indentation === "grouped" || isInSection
						? "pl-[50px]"
						: "pl-[42px]",
				onClick && "cursor-pointer",
			)}
			onMouseDown={stopChipDragStart}
			onTouchStart={stopChipDragStart}
			onClick={(event) => {
				if (!onClick) return;
				const target = event.target as HTMLElement;
				if (!event.currentTarget.contains(target)) return;
				const interactiveTarget = target.closest(
					"button, a, [role='button'], [role='menuitem']",
				);
				if (
					interactiveTarget &&
					event.currentTarget.contains(interactiveTarget)
				) {
					return;
				}
				onClick(event);
			}}
		>
			<DashboardSidebarPortsChip ports={ports} />
		</div>
	);
}
