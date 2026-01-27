/**
 * Presence bar showing viewers and typing indicators
 */

import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { cn } from "@superset/ui/utils";
import type { PresenceUser } from "../../types";

export interface PresenceBarProps {
	viewers: PresenceUser[];
	typingUsers: PresenceUser[];
	className?: string;
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function PresenceBar({
	viewers,
	typingUsers,
	className,
}: PresenceBarProps) {
	if (viewers.length === 0 && typingUsers.length === 0) {
		return null;
	}

	return (
		<div
			className={cn(
				"flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50",
				className,
			)}
		>
			{/* Viewers */}
			{viewers.length > 0 && (
				<div className="flex items-center gap-1">
					<div className="flex -space-x-2">
						{viewers.slice(0, 5).map((user) => (
							<Avatar
								key={user.userId}
								className="h-6 w-6 border-2 border-background"
							>
								{user.image && <AvatarImage src={user.image} />}
								<AvatarFallback className="text-xs">
									{getInitials(user.name)}
								</AvatarFallback>
							</Avatar>
						))}
					</div>
					{viewers.length > 5 && (
						<span className="text-xs text-muted-foreground">
							+{viewers.length - 5}
						</span>
					)}
					<span className="text-xs text-muted-foreground ml-1">viewing</span>
				</div>
			)}

			{/* Typing indicator */}
			{typingUsers.length > 0 && (
				<div className="flex items-center gap-1 ml-auto">
					<span className="text-xs text-muted-foreground">
						{typingUsers.length === 1
							? `${typingUsers[0]?.name} is typing`
							: `${typingUsers.length} people typing`}
					</span>
					<span className="flex gap-0.5">
						<span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
						<span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
						<span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
					</span>
				</div>
			)}
		</div>
	);
}
