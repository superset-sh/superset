import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useMemo, useState } from "react";
import {
	HiOutlineBell,
	HiOutlineCheckCircle,
	HiOutlineExclamationTriangle,
} from "react-icons/hi2";
import { LuArchive } from "react-icons/lu";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import {
	type NotificationCenterEntry,
	type NotificationCenterEntryKind,
	useNotificationCenterEntries,
	useNotificationCenterStore,
} from "renderer/stores/notification-center";

interface TabMeta {
	value: NotificationCenterEntryKind;
	label: string;
}

const TABS: TabMeta[] = [
	{ value: "notification", label: "Notifications" },
	{ value: "error", label: "Errors" },
];

function formatTimestamp(timestamp: number): string {
	try {
		return formatDistanceToNow(timestamp, { addSuffix: true });
	} catch {
		return "just now";
	}
}

export function NotificationsCenter() {
	const [open, setOpen] = useState(false);
	const [activeTab, setActiveTab] =
		useState<NotificationCenterEntryKind>("notification");
	const entries = useNotificationCenterEntries();
	const markRead = useNotificationCenterStore((state) => state.markRead);
	const markAllRead = useNotificationCenterStore((state) => state.markAllRead);
	const archive = useNotificationCenterStore((state) => state.archive);
	const archiveAll = useNotificationCenterStore((state) => state.archiveAll);
	const navigate = useNavigate();

	const unreadCounts = useMemo(() => {
		const counts: Record<NotificationCenterEntryKind, number> = {
			notification: 0,
			error: 0,
		};

		for (const entry of entries) {
			if (entry.archived || entry.read) continue;
			counts[entry.kind] += 1;
		}
		return counts;
	}, [entries]);

	const visibleEntries = useMemo(
		() =>
			entries.filter((entry) => !entry.archived && entry.kind === activeTab),
		[entries, activeTab],
	);

	const unreadTotal = unreadCounts.notification + unreadCounts.error;

	const handleOpenEntry = (entry: NotificationCenterEntry) => {
		markRead(entry.id);

		const workspaceId = entry.target?.workspaceId;
		if (!workspaceId) return;

		void navigateToWorkspace(workspaceId, navigate, {
			search: {
				tabId: entry.target?.tabId,
				paneId: entry.target?.paneId,
			},
		}).catch((error) => {
			console.warn(
				"[notifications] Failed to navigate from notification",
				error,
			);
		});
		setOpen(false);
	};

	const handleArchive = (entry: NotificationCenterEntry) => {
		archive(entry.id);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="no-drag relative flex items-center gap-1.5 h-6 px-1.5 rounded border border-border/60 bg-secondary/50 hover:bg-secondary hover:border-border transition-all duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-ring"
					aria-label="Notification center"
				>
					<HiOutlineBell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
					{unreadTotal > 0 && (
						<span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-4 font-semibold text-center tabular-nums">
							{unreadTotal > 99 ? "99+" : unreadTotal}
						</span>
					)}
				</button>
			</PopoverTrigger>

			<PopoverContent align="end" className="w-[380px] p-0">
				<div className="border-b border-border p-2">
					<Tabs
						value={activeTab}
						onValueChange={(value) =>
							setActiveTab(value as NotificationCenterEntryKind)
						}
					>
						<TabsList className="h-8 bg-transparent p-0 gap-1 w-full justify-start">
							{TABS.map((tab) => (
								<TabsTrigger
									key={tab.value}
									value={tab.value}
									className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
								>
									{tab.label}
									{unreadCounts[tab.value] > 0 && (
										<span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0 text-[10px] leading-4 tabular-nums">
											{unreadCounts[tab.value]}
										</span>
									)}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</div>

				<ScrollArea className="h-[360px]">
					{visibleEntries.length === 0 ? (
						<div className="px-4 py-10 text-center text-sm text-muted-foreground">
							{activeTab === "notification"
								? "No notifications in the queue."
								: "No errors in the queue."}
						</div>
					) : (
						<div className="divide-y divide-border">
							{visibleEntries.map((entry) => {
								const description = entry.description;
								return (
									<div
										key={entry.id}
										className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-3 py-2.5"
									>
										<button
											type="button"
											onClick={() => handleOpenEntry(entry)}
											className="min-w-0 flex items-start gap-2.5 text-left"
										>
											<div className="mt-0.5 shrink-0 flex items-center gap-1.5">
												<span
													className={`size-2 rounded-full ${entry.read ? "bg-muted-foreground/30" : "bg-blue-500"}`}
													aria-hidden="true"
												/>
												{entry.kind === "error" ? (
													<HiOutlineExclamationTriangle className="size-4 text-destructive" />
												) : (
													<HiOutlineCheckCircle className="size-4 text-emerald-500" />
												)}
											</div>

											<div className="min-w-0 flex-1">
												<p className="text-sm text-foreground break-words line-clamp-2">
													{description}
												</p>
												<p className="mt-1 text-[11px] text-muted-foreground">
													{formatTimestamp(entry.timestamp)}
												</p>
											</div>
										</button>

										<button
											type="button"
											onClick={() => handleArchive(entry)}
											className="mt-0.5 inline-flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
											aria-label="Archive notification"
										>
											<LuArchive className="size-3.5" />
										</button>
									</div>
								);
							})}
						</div>
					)}
				</ScrollArea>

				<div className="border-t border-border px-2 py-2 flex items-center justify-between">
					<div className="flex items-center gap-1">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-xs"
							onClick={() => markAllRead(activeTab)}
						>
							Mark all read
						</Button>
					</div>

					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs"
						onClick={() => archiveAll(activeTab)}
					>
						Archive all
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
