import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { HiChevronRight } from "react-icons/hi2";
import type { SidebarSectionKey } from "renderer/stores/sidebar-sections-collapse";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";

interface DashboardSidebarSectionHeaderProps {
	label: string;
	section: SidebarSectionKey;
	/**
	 * Omit the label, chevron, and spacer so a child control can take the
	 * whole row (the Projects header's expanded filter input). The strip
	 * still toggles the section on click, so that control must stopPropagation.
	 */
	labelHidden?: boolean;
	/** Right-aligned actions; they must stopPropagation on click/keydown so they don't toggle the collapse. */
	children?: ReactNode;
}

/**
 * Top-level section header strip (Pinned / Sessions / Projects). The whole
 * strip toggles the section's persisted collapse state; the chevron stays
 * visible while collapsed — it's the only cue that the rows below are hidden
 * rather than missing (GH #6009).
 */
export function DashboardSidebarSectionHeader({
	label,
	section,
	labelHidden = false,
	children,
}: DashboardSidebarSectionHeaderProps) {
	const isCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed[section],
	);
	const toggle = useSidebarSectionsCollapseStore((s) => s.toggle);

	return (
		// biome-ignore lint/a11y/useSemanticElements: can't be a native <button> — it may nest action buttons
		<div
			role="button"
			tabIndex={0}
			// The visible label is the accessible name; keep it when the label is
			// hidden so the toggle is never an unnamed button.
			aria-label={label}
			onClick={() => toggle(section)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					toggle(section);
				}
			}}
			className="group flex h-7 w-full shrink-0 items-center gap-1.5 pl-4 pr-2 text-[10px] font-semibold uppercase tracking-[0.075em] text-muted-foreground transition-colors"
		>
			{!labelHidden && (
				<>
					<span className="min-w-0 truncate text-left">{label}</span>
					<HiChevronRight
						className={cn(
							"size-3 shrink-0 text-muted-foreground transition-[opacity,transform] duration-150",
							isCollapsed
								? "opacity-100"
								: "rotate-90 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
						)}
					/>
					<div className="min-w-0 flex-1" />
				</>
			)}
			{children}
		</div>
	);
}
