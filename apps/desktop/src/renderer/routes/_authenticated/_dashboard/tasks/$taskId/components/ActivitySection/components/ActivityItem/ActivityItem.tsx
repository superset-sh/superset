import { formatDistanceToNow } from "date-fns";

interface ActivityItemProps {
	avatarUrl?: string | null;
	avatarFallback: string;
	actorName: string;
	action: string;
	timestamp: Date;
	body?: string | null;
	externalUrl?: string | null;
}

export function ActivityItem({
	avatarUrl,
	avatarFallback,
	actorName,
	action,
	timestamp,
	body,
	externalUrl,
}: ActivityItemProps) {
	return (
		<div className="flex items-start gap-3">
			{avatarUrl ? (
				<img
					src={avatarUrl}
					alt=""
					className="w-6 h-6 rounded-full shrink-0 mt-0.5"
				/>
			) : (
				<div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs shrink-0 mt-0.5">
					{avatarFallback}
				</div>
			)}
			<div className="text-sm">
				<span className="text-foreground">{actorName}</span>
				<span className="text-muted-foreground">
					{" "}
					{action} · {formatDistanceToNow(timestamp, { addSuffix: true })}
				</span>
				{body ? (
					<div className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/40 px-2 py-1.5 text-foreground text-xs">
						{body}
					</div>
				) : null}
				{externalUrl ? (
					<a
						href={externalUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="mt-1 block text-primary text-xs underline"
					>
						View in Linear
					</a>
				) : null}
			</div>
		</div>
	);
}
