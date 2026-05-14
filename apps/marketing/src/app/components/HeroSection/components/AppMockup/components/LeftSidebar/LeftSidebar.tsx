"use client";

import { motion } from "framer-motion";
import {
	LuChevronDown,
	LuChevronRight,
	LuLayers,
	LuPlus,
	LuZap,
} from "react-icons/lu";
import { PORTS, WORKSPACES } from "../../constants";
import type { ActiveDemo } from "../../types";
import { AsciiSpinner } from "../AsciiSpinner";
import { WorkspaceItem } from "../WorkspaceItem";

interface LeftSidebarProps {
	activeDemo: ActiveDemo;
}

export function LeftSidebar({ activeDemo }: LeftSidebarProps) {
	return (
		<div className="flex w-[208px] shrink-0 flex-col border-r border-border bg-card text-[11px]">
			<div className="flex h-9 items-center gap-1.5 px-3">
				<div className="size-2.5 rounded-full bg-[#ff5f57]" />
				<div className="size-2.5 rounded-full bg-[#febc2e]" />
				<div className="size-2.5 rounded-full bg-[#28c840]" />
			</div>

			<div className="space-y-px px-1.5 pt-1">
				<NavRow icon={LuLayers} label="Workspaces" active />
				<NavRow icon={LuZap} label="Automations" />
				<NavRow icon={LuPlus} label="New Workspace" muted />
			</div>

			<div className="mt-3 flex-1 overflow-hidden">
				<GroupHeader label="desktop" count={5} expanded />

				<motion.div
					className="overflow-hidden"
					initial={{ height: 0, opacity: 0 }}
					animate={{
						height: activeDemo === "Create Parallel Branches" ? "auto" : 0,
						opacity: activeDemo === "Create Parallel Branches" ? 1 : 0,
					}}
					transition={{ duration: 0.25, ease: "easeOut" }}
				>
					<div className="relative flex h-7 items-center gap-2.5 bg-brand/[0.10] pl-4 pr-3">
						<span className="absolute inset-y-1 left-0 w-[2px] bg-brand" />
						<AsciiSpinner
							className="text-[10px]"
							toneClassName="text-brand-light"
						/>
						<span className="truncate text-foreground/95">new workspace</span>
						<span className="ml-auto font-mono text-[10px] text-muted-foreground/55">
							creating
						</span>
					</div>
				</motion.div>

				<div className="mt-1 space-y-0.5">
					{WORKSPACES.map((workspace) => {
						const isFirstItem = workspace.name === "use any agents";
						const shouldHideActiveState =
							isFirstItem && activeDemo === "Create Parallel Branches";

						return (
							<WorkspaceItem
								key={workspace.branch}
								name={workspace.name}
								branch={workspace.branch}
								add={workspace.add}
								del={workspace.del}
								pr={workspace.pr}
								isActive={shouldHideActiveState ? false : workspace.isActive}
								status={shouldHideActiveState ? undefined : workspace.status}
							/>
						);
					})}
				</div>

				<div className="mt-3">
					<GroupHeader label="cloud" count={3} />
				</div>
				<div className="mt-1">
					<GroupHeader label="mobile" count={1} />
				</div>
				<div className="mt-1">
					<GroupHeader label="cli" count={2} />
				</div>
			</div>

			<div className="border-t border-border pb-1.5">
				<div className="flex h-7 items-center gap-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/65">
					<span className="font-mono normal-case text-muted-foreground/55">
						⌥
					</span>
					<span>Ports</span>
					<span className="ml-auto font-mono tabular-nums text-muted-foreground/40">
						4
					</span>
				</div>
				{PORTS.map((port) => (
					<div key={port.workspace} className="px-3 py-1">
						<div className="truncate text-[10px] text-muted-foreground/65">
							{port.workspace}
						</div>
						<div className="mt-1 flex flex-wrap gap-1">
							{port.ports.map((value) => (
								<span
									key={value}
									className="border border-border bg-background px-1.5 py-px font-mono text-[10px] tabular-nums text-muted-foreground/70"
								>
									{value}
								</span>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function NavRow({
	icon: Icon,
	label,
	active,
	muted,
}: {
	icon: typeof LuLayers;
	label: string;
	active?: boolean;
	muted?: boolean;
}) {
	return (
		<div
			className={`flex h-6 cursor-pointer items-center gap-2 px-2 ${
				active
					? "bg-foreground/[0.06] text-foreground"
					: muted
						? "text-muted-foreground/55 hover:text-foreground/80"
						: "text-foreground/85 hover:bg-foreground/[0.025]"
			}`}
		>
			<Icon
				className={`size-3.5 ${active ? "text-foreground/85" : "text-muted-foreground/55"}`}
			/>
			<span>{label}</span>
		</div>
	);
}

function GroupHeader({
	label,
	count,
	expanded,
}: {
	label: string;
	count: number;
	expanded?: boolean;
}) {
	const ChevronIcon = expanded ? LuChevronDown : LuChevronRight;
	return (
		<div className="flex h-6 items-center gap-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/65">
			<ChevronIcon className="size-2.5 text-muted-foreground/45" />
			<span className="truncate">{label}</span>
			<span className="ml-auto font-mono tabular-nums text-muted-foreground/40">
				{count}
			</span>
		</div>
	);
}
