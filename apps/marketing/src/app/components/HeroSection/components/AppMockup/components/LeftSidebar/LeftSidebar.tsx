"use client";

import { motion } from "framer-motion";
import {
	LuChevronDown,
	LuChevronRight,
	LuLayers,
	LuPlus,
	LuZap,
} from "react-icons/lu";
import { WORKSPACES } from "../../constants";
import type { ActiveDemo } from "../../types";
import { AsciiSpinner } from "../AsciiSpinner";
import { WorkspaceItem } from "../WorkspaceItem";

interface LeftSidebarProps {
	activeDemo: ActiveDemo;
}

export function LeftSidebar({ activeDemo }: LeftSidebarProps) {
	return (
		<div className="flex w-[208px] shrink-0 flex-col border-r border-border/60 bg-card text-[11px]">
			<div className="flex h-9 items-center gap-1.5 px-3">
				<div className="size-2.5 rounded-full bg-[#ff5f57]" />
				<div className="size-2.5 rounded-full bg-[#febc2e]" />
				<div className="size-2.5 rounded-full bg-[#28c840]" />
			</div>

			<div className="space-y-px px-1.5 pt-1">
				<NavRow icon={LuLayers} label="Workspaces" />
				<NavRow icon={LuZap} label="Automations" />
				<NavRow icon={LuPlus} label="New Workspace" />
			</div>

			<div className="mt-6 flex-1 overflow-hidden">
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
		</div>
	);
}

function NavRow({
	icon: Icon,
	label,
}: {
	icon: typeof LuLayers;
	label: string;
}) {
	return (
		<div className="flex h-6 cursor-pointer items-center gap-2 px-2 text-muted-foreground/55 hover:text-foreground/80">
			<Icon className="size-3.5 text-muted-foreground/55" />
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
