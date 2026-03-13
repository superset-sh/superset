import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuChevronDown,
	LuChevronRight,
	LuCircle,
	LuLoader,
	LuPlus,
	LuRefreshCw,
	LuServer,
	LuTrash2,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface SlotManagerSectionProps {
	worktreePath: string | undefined;
	onSpawnCommand: (command: string) => void;
}

export function SlotManagerSection({
	worktreePath,
	onSpawnCommand,
}: SlotManagerSectionProps) {
	const [collapsed, setCollapsed] = useState(false);
	const utils = electronTrpc.useUtils();

	const { data: slots, isLoading } =
		electronTrpc.archOne.getSlotStatus.useQuery(undefined, {
			staleTime: 10_000,
			refetchInterval: 30_000,
		});

	const killSlot = electronTrpc.archOne.killSlot.useMutation({
		onSuccess: () => {
			utils.archOne.getSlotStatus.invalidate();
		},
	});

	const allocateSlot = electronTrpc.archOne.allocateSlot.useMutation({
		onSuccess: (result) => {
			utils.archOne.getSlotStatus.invalidate();
			if (result.slot !== null) {
				onSpawnCommand("npm run dev:detached");
			}
		},
	});

	const [killingSlot, setKillingSlot] = useState<number | null>(null);

	const handleKill = async (
		slot: number,
		tmuxSession: string,
		path: string,
	) => {
		setKillingSlot(slot);
		try {
			await killSlot.mutateAsync({ tmuxSession, path });
		} finally {
			setKillingSlot(null);
		}
	};

	const handleAllocate = () => {
		if (!worktreePath) return;
		allocateSlot.mutate({ worktreePath });
	};

	const occupiedCount = slots?.filter((s) => s.path !== null).length ?? 0;
	const totalSlots = slots?.length ?? 4;
	const hasAvailableSlot = occupiedCount < totalSlots;
	const isCurrentWorkspaceAllocated = slots?.some(
		(s) => s.path === worktreePath,
	);

	return (
		<div className="overflow-hidden border-t border-border">
			<button
				type="button"
				onClick={() => setCollapsed(!collapsed)}
				className={cn(
					"flex w-full items-center gap-1.5 px-3 py-2",
					"text-xs font-medium uppercase tracking-wider text-muted-foreground",
					"hover:bg-accent/30 cursor-pointer transition-colors",
				)}
			>
				{collapsed ? (
					<LuChevronRight className="size-3 shrink-0" />
				) : (
					<LuChevronDown className="size-3 shrink-0" />
				)}
				<LuServer className="size-3 shrink-0" />
				<span>Dev Slots</span>
				<span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
					{occupiedCount}/{totalSlots}
				</span>
			</button>

			{!collapsed && (
				<div className="px-3 py-2 text-sm">
					{isLoading ? (
						<p className="text-muted-foreground">Loading...</p>
					) : !slots ? (
						<p className="text-muted-foreground">
							No slot registry found
						</p>
					) : (
						<div className="space-y-1.5">
							{slots.map((slot) => (
								<div
									key={slot.slot}
									className="flex items-center gap-2"
								>
									<LuCircle
										className={cn(
											"size-2 shrink-0",
											slot.path
												? slot.alive
													? "fill-green-500 text-green-500"
													: "fill-yellow-500 text-yellow-500"
												: "fill-muted text-muted",
										)}
									/>
									<span className="shrink-0 text-muted-foreground tabular-nums">
										{slot.slot}
									</span>
									{slot.path ? (
										<>
											<span className="truncate flex-1 font-mono text-xs">
												{slot.branch ?? slot.path.split("/").pop()}
											</span>
											<span className="shrink-0 text-muted-foreground text-[10px] tabular-nums">
												:{8080 + slot.slot * 100}
											</span>
											{killingSlot === slot.slot ? (
												<LuLoader className="size-3 shrink-0 animate-spin text-muted-foreground" />
											) : (
												<Button
													variant="ghost"
													size="icon"
													className="ml-auto size-6 shrink-0"
													title={`Kill slot ${slot.slot}`}
													onClick={() =>
														handleKill(
															slot.slot,
															slot.tmuxSession ?? "",
															slot.path ?? "",
														)
													}
												>
													<LuTrash2 className="size-3" />
												</Button>
											)}
										</>
									) : (
										<span className="text-muted-foreground/50 text-xs">
											available
										</span>
									)}
								</div>
							))}
							<div className="flex gap-1.5 pt-1">
								{worktreePath && hasAvailableSlot && !isCurrentWorkspaceAllocated && (
									<Button
										variant="ghost"
										size="sm"
										className="flex-1 h-7 text-xs"
										onClick={handleAllocate}
										disabled={allocateSlot.isPending}
									>
										{allocateSlot.isPending ? (
											<LuLoader className="size-3 mr-1.5 animate-spin" />
										) : (
											<LuPlus className="size-3 mr-1.5" />
										)}
										Setup Slot
									</Button>
								)}
								<Button
									variant="ghost"
									size="sm"
									className={cn(
										"h-7 text-xs",
										worktreePath && hasAvailableSlot && !isCurrentWorkspaceAllocated
											? "flex-1"
											: "w-full",
									)}
									onClick={() =>
										utils.archOne.getSlotStatus.invalidate()
									}
								>
									<LuRefreshCw className="size-3 mr-1.5" />
									Refresh
								</Button>
							</div>
							{allocateSlot.isError && (
								<p className="text-destructive text-xs">
									{allocateSlot.error.message}
								</p>
							)}
							{allocateSlot.data?.error && (
								<p className="text-destructive text-xs">
									{allocateSlot.data.error}
								</p>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
