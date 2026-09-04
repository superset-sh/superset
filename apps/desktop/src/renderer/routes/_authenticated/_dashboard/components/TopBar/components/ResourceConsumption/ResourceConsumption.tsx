import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import {
	HiOutlineArrowPath,
	HiOutlineBarsArrowDown,
	HiOutlineCpuChip,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useRenderStressInstrumentation } from "renderer/lib/performance/stress-instrumentation";
import { AppResourceSection } from "./components/AppResourceSection";
import { ResourceMetricsSummary } from "./components/ResourceMetricsSummary";
import { WorkspaceResourceSection } from "./components/WorkspaceResourceSection";
import { useResourceNavigation } from "./hooks/useResourceNavigation";
import { useResourceSnapshot } from "./hooks/useResourceSnapshot";
import type { SortOption, UsageValues } from "./types";

const SORT_LABELS: Record<SortOption, MessageDescriptor> = {
	memory: msg({
		message: "Memory",
	}),
	cpu: msg({ message: "CPU" }),
	name: msg({
		message: "Name",
	}),
	sidebar: msg({
		message: "Sidebar order",
	}),
};

function getTotalUsage(
	cpu: number | undefined,
	memory: number | undefined,
): UsageValues {
	return {
		cpu: cpu ?? 0,
		memory: memory ?? 0,
	};
}

interface ResourceConsumptionProps {
	surface?: "v1" | "v2";
	className?: string;
}

export function ResourceConsumption({
	surface = "v1",
	className,
}: ResourceConsumptionProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const { data: enabled } =
		electronTrpc.settings.getShowResourceMonitor.useQuery();

	useRenderStressInstrumentation("ResourceConsumptionTrigger", {
		warnAt: 25,
		getDetails: () => ({ open, surface }),
	});

	if (!enabled) return null;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label={t({
								message: "Resource consumption",
							})}
							className={cn(
								"no-drag relative text-muted-foreground hover:text-foreground",
								className,
							)}
						>
							<HiOutlineCpuChip className="size-3.5" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={6}>
					<Trans>Resources</Trans>
				</TooltipContent>
			</Tooltip>

			{open && (
				<ResourceConsumptionContent
					surface={surface}
					onClose={() => setOpen(false)}
				/>
			)}
		</Popover>
	);
}

interface ResourceConsumptionContentProps {
	surface: "v1" | "v2";
	onClose: () => void;
}

function ResourceConsumptionContent({
	surface,
	onClose,
}: ResourceConsumptionContentProps) {
	const { t } = useLingui();
	const [sortOption, setSortOption] = useState<SortOption>("memory");
	const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(
		new Set(),
	);
	const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Set<string>>(
		new Set(),
	);

	useRenderStressInstrumentation("ResourceConsumptionContent", {
		warnAt: 25,
		getDetails: () => ({ surface }),
	});

	const {
		snapshot: normalizedSnapshot,
		refetch,
		isFetching,
		sidebarProjectOrder,
		sidebarWorkspaceOrder,
	} = useResourceSnapshot(surface);

	const { getPaneName, navigateToWorkspace, navigateToPane } =
		useResourceNavigation({ surface, onNavigate: onClose });

	const toggleWorkspace = (workspaceId: string) => {
		setCollapsedWorkspaces((prev) => {
			const next = new Set(prev);
			if (next.has(workspaceId)) {
				next.delete(workspaceId);
			} else {
				next.add(workspaceId);
			}
			return next;
		});
	};

	const toggleProject = (projectId: string) => {
		setCollapsedProjects((prev) => {
			const next = new Set(prev);
			if (next.has(projectId)) {
				next.delete(projectId);
			} else {
				next.add(projectId);
			}
			return next;
		});
	};

	const totalUsage = getTotalUsage(
		normalizedSnapshot?.totalCpu,
		normalizedSnapshot?.totalMemory,
	);

	return (
		<PopoverContent align="start" className="w-[28rem] p-0 overflow-hidden">
			<div className="px-3.5 pt-3 pb-3 border-b border-border/60">
				<div className="flex items-center justify-between">
					<h4 className="text-[13px] font-medium tracking-tight text-foreground">
						<Trans>Resources</Trans>
					</h4>
					<div className="flex items-center gap-0.5">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="flex items-center gap-1 h-6 px-1.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
									aria-label={t({
										message: "Sort workspaces",
									})}
								>
									<HiOutlineBarsArrowDown className="h-3.5 w-3.5" />
									<span>{i18n._(SORT_LABELS[sortOption])}</span>
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-40">
								<DropdownMenuRadioGroup
									value={sortOption}
									onValueChange={(value) => setSortOption(value as SortOption)}
								>
									<DropdownMenuRadioItem value="memory">
										<Trans>Memory</Trans>
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="cpu">
										<Trans>CPU</Trans>
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="name">
										<Trans>Name</Trans>
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="sidebar">
										<Trans>Sidebar order</Trans>
									</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>
						<button
							type="button"
							onClick={() => refetch()}
							className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
							aria-label={t({
								message: "Refresh metrics",
							})}
						>
							<HiOutlineArrowPath
								className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
							/>
						</button>
					</div>
				</div>

				{normalizedSnapshot && (
					<div className="mt-3">
						<ResourceMetricsSummary snapshot={normalizedSnapshot} />
					</div>
				)}
			</div>

			<div className="max-h-[50vh] overflow-y-auto">
				{normalizedSnapshot && (
					<AppResourceSection
						app={normalizedSnapshot.app}
						totalUsage={totalUsage}
					/>
				)}

				{normalizedSnapshot && (
					<WorkspaceResourceSection
						workspaces={normalizedSnapshot.workspaces}
						sortOption={sortOption}
						sidebarProjectOrder={sidebarProjectOrder}
						sidebarWorkspaceOrder={sidebarWorkspaceOrder}
						collapsedProjects={collapsedProjects}
						toggleProject={toggleProject}
						collapsedWorkspaces={collapsedWorkspaces}
						toggleWorkspace={toggleWorkspace}
						navigateToWorkspace={navigateToWorkspace}
						navigateToPane={navigateToPane}
						getPaneName={getPaneName}
					/>
				)}

				{normalizedSnapshot && normalizedSnapshot.workspaces.length === 0 && (
					<div className="px-3.5 py-6 text-center text-[11px] text-muted-foreground">
						<Trans>No active terminal sessions</Trans>
					</div>
				)}

				{!normalizedSnapshot && (
					<div className="px-3.5 py-6 text-center text-[11px] text-muted-foreground">
						<Trans>Loading…</Trans>
					</div>
				)}
			</div>
		</PopoverContent>
	);
}
