import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useCallback } from "react";
import { HiExclamationCircle, HiOutlineBell, HiXMark } from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider";
import {
	type AgentNotification,
	agentNotificationOperations,
} from "renderer/stores/agent-screens";
import { useNotificationSidebarStore } from "renderer/stores/notification-sidebar-state";

interface NotificationCardProps {
	notification: AgentNotification;
}

export function NotificationCard({ notification }: NotificationCardProps) {
	const navigate = useNavigate();
	const collections = useCollections();
	const setOpen = useNotificationSidebarStore((s) => s.setOpen);

	const handleClick = useCallback(() => {
		agentNotificationOperations.markNotificationViewed(
			collections.agentNotifications,
			notification.id,
		);
		setOpen(false);
		navigate({ to: `/screen/${notification.screenId}` });
	}, [
		notification.id,
		notification.screenId,
		collections.agentNotifications,
		setOpen,
		navigate,
	]);

	const handleDismiss = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			agentNotificationOperations.dismissNotification(
				collections.agentNotifications,
				notification.id,
			);
		},
		[notification.id, collections.agentNotifications],
	);

	const getPriorityIcon = () => {
		switch (notification.priority) {
			case "urgent":
				return <HiExclamationCircle className="w-4 h-4 text-destructive" />;
			case "high":
				return <HiExclamationCircle className="w-4 h-4 text-warning" />;
			default:
				return <HiOutlineBell className="w-4 h-4 text-muted-foreground" />;
		}
	};

	const isNew = notification.status === "pending";
	const timeAgo = formatDistanceToNow(new Date(notification.createdAt), {
		addSuffix: true,
	});

	return (
		<button
			type="button"
			onClick={handleClick}
			className={`
				relative p-3 rounded-lg cursor-pointer transition-colors text-left w-full
				${isNew ? "bg-primary/5 hover:bg-primary/10" : "bg-muted/30 hover:bg-muted/50"}
				border ${isNew ? "border-primary/20" : "border-border/50"}
			`}
		>
			{/* Dismiss button */}
			<Button
				variant="ghost"
				size="icon"
				className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100"
				onClick={handleDismiss}
				title="Dismiss"
			>
				<HiXMark className="w-3 h-3" />
			</Button>

			{/* Content */}
			<div className="flex items-start gap-2">
				<div className="shrink-0 mt-0.5">{getPriorityIcon()}</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<h3
							className={`text-sm font-medium truncate ${isNew ? "text-foreground" : "text-foreground/80"}`}
						>
							{notification.title}
						</h3>
						{isNew && (
							<span className="shrink-0 w-2 h-2 rounded-full bg-primary" />
						)}
					</div>
					{notification.body && (
						<p className="text-xs text-muted-foreground mt-1 line-clamp-2">
							{notification.body}
						</p>
					)}
					<p className="text-xs text-muted-foreground/70 mt-2">{timeAgo}</p>
				</div>
			</div>
		</button>
	);
}
