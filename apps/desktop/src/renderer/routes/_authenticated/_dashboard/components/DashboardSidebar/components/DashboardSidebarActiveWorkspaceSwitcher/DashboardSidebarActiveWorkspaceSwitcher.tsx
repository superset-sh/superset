import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHotkey } from "renderer/hotkeys";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { ActivePaneStatus } from "shared/tabs-types";
import { useSidebarWorkspaceStatuses } from "../../providers/DashboardSidebarWorkspaceStatusProvider";

export interface ActiveWorkspaceSwitcherOption {
	id: string;
	name: string;
	detail: string | null;
}

interface DashboardSidebarActiveWorkspaceSwitcherProps {
	workspaces: ActiveWorkspaceSwitcherOption[];
	activeWorkspaceId: string | null;
}

type SwitcherGroup = "needsInput" | "completed" | "running";

type SwitcherItem = ActiveWorkspaceSwitcherOption & {
	status: ActivePaneStatus;
	group: SwitcherGroup;
};

interface SwitcherSession {
	items: SwitcherItem[];
	index: number;
	cycleCode: string;
	holdsModifier: boolean;
	returnFocusTo: HTMLElement | null;
}

const GROUP_BY_STATUS: Record<ActivePaneStatus, SwitcherGroup> = {
	permission: "needsInput",
	review: "completed",
	failed: "completed",
	working: "running",
};

const GROUP_ORDER: SwitcherGroup[] = ["needsInput", "completed", "running"];

function holdsAnyModifier(e: KeyboardEvent): boolean {
	return e.metaKey || e.ctrlKey || e.altKey;
}

export function DashboardSidebarActiveWorkspaceSwitcher({
	workspaces,
	activeWorkspaceId,
}: DashboardSidebarActiveWorkspaceSwitcherProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const statuses = useSidebarWorkspaceStatuses();
	const [session, setSession] = useState<SwitcherSession | null>(null);
	const sessionRef = useRef<SwitcherSession | null>(null);

	const updateSession = useCallback((next: SwitcherSession | null) => {
		sessionRef.current = next;
		setSession(next);
	}, []);

	useHotkey(
		"OPEN_ACTIVE_WORKSPACE_SWITCHER",
		(e) => {
			if (sessionRef.current) return;
			const items: SwitcherItem[] = [];
			for (const workspace of workspaces) {
				if (workspace.id === activeWorkspaceId) continue;
				const status = statuses.get(workspace.id)?.status;
				if (!status) continue;
				items.push({ ...workspace, status, group: GROUP_BY_STATUS[status] });
			}
			items.sort(
				(a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
			);
			updateSession({
				items,
				index: 0,
				cycleCode: e.code,
				holdsModifier: holdsAnyModifier(e),
				returnFocusTo:
					document.activeElement instanceof HTMLElement
						? document.activeElement
						: null,
			});
		},
		{ ignoreEventWhen: (e) => e.defaultPrevented },
	);

	useEffect(() => {
		const close = () => {
			const returnFocusTo = sessionRef.current?.returnFocusTo;
			updateSession(null);
			if (returnFocusTo?.isConnected) returnFocusTo.focus();
		};
		const commit = () => {
			const target = sessionRef.current?.items[sessionRef.current.index];
			close();
			if (target) navigateToV2Workspace(target.id, navigate);
		};
		const step = (delta: number) => {
			const current = sessionRef.current;
			if (!current || current.items.length === 0) return;
			const count = current.items.length;
			updateSession({
				...current,
				index: (current.index + delta + count) % count,
			});
		};

		const onKeyDown = (e: KeyboardEvent) => {
			const current = sessionRef.current;
			if (!current) return;
			e.preventDefault();
			e.stopPropagation();
			if (e.code === current.cycleCode || e.key === "Tab")
				step(e.shiftKey ? -1 : 1);
			else if (e.key === "ArrowRight") step(1);
			else if (e.key === "ArrowLeft") step(-1);
			else if (e.key === "Enter") commit();
			else if (e.key === "Escape") close();
		};
		const onKeyUp = (e: KeyboardEvent) => {
			const current = sessionRef.current;
			if (!current?.holdsModifier || holdsAnyModifier(e)) return;
			commit();
		};

		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("keyup", onKeyUp, true);
		window.addEventListener("blur", close);
		return () => {
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("keyup", onKeyUp, true);
			window.removeEventListener("blur", close);
		};
	}, [navigate, updateSession]);

	const optionIdPrefix = useId();
	const listboxRef = useRef<HTMLDivElement>(null);
	const selectedChipRef = useRef<HTMLDivElement>(null);
	const isOpen = session !== null;
	const selectedIndex = session?.index;
	useEffect(() => {
		if (isOpen) listboxRef.current?.focus();
	}, [isOpen]);
	useEffect(() => {
		if (selectedIndex === undefined) return;
		selectedChipRef.current?.scrollIntoView({
			block: "nearest",
			inline: "nearest",
		});
	}, [selectedIndex]);

	if (!session) return null;

	const headings: Record<SwitcherGroup, string> = {
		needsInput: t({ message: "Needs input" }),
		completed: t({ message: "Completed" }),
		running: t({ message: "Running" }),
	};

	const selected = session.items[session.index];

	return createPortal(
		<div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex flex-col items-center gap-1.5">
			<div
				ref={listboxRef}
				role="listbox"
				tabIndex={-1}
				aria-orientation="horizontal"
				aria-activedescendant={
					selected ? `${optionIdPrefix}-${session.index}` : undefined
				}
				aria-label={t({ message: "Switch to Active Workspace" })}
				className="pointer-events-auto flex max-w-[90vw] items-center gap-1 overflow-x-auto rounded-xl border bg-popover p-1.5 outline-none text-popover-foreground shadow-2xl ring-1 ring-black/20 [scrollbar-width:none]"
			>
				{session.items.length === 0 ? (
					<div className="px-3 py-1 text-xs text-muted-foreground">
						{t({ message: "No active workspaces" })}
					</div>
				) : (
					session.items.map((item, index) => (
						<div className="flex shrink-0 items-center gap-1" key={item.id}>
							{index > 0 && item.group !== session.items[index - 1]?.group && (
								<span className="mx-1 h-4 w-px shrink-0 bg-border" />
							)}
							<div
								ref={index === session.index ? selectedChipRef : undefined}
								id={`${optionIdPrefix}-${index}`}
								role="option"
								tabIndex={-1}
								aria-selected={index === session.index}
								className={cn(
									"flex h-8 max-w-56 cursor-default items-center gap-2 rounded-lg px-3 text-[13px] text-muted-foreground",
									index === session.index &&
										"bg-accent text-accent-foreground ring-1 ring-border",
								)}
								onMouseEnter={() => updateSession({ ...session, index })}
								onMouseDown={(e) => {
									e.preventDefault();
									updateSession(null);
									navigateToV2Workspace(item.id, navigate);
								}}
							>
								<StatusIndicator status={item.status} />
								<span className="truncate">{item.name}</span>
							</div>
						</div>
					))
				)}
			</div>
			{selected && (
				<div className="pointer-events-none rounded-md border bg-popover px-2 py-0.5 text-[11px] text-muted-foreground shadow-md">
					{selected.detail
						? `${headings[selected.group]} · ${selected.detail}`
						: headings[selected.group]}
				</div>
			)}
		</div>,
		document.body,
	);
}
