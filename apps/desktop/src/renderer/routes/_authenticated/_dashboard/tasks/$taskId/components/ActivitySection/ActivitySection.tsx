import { ActivityItem } from "./components/ActivityItem";

interface ActivitySectionProps {
	createdAt: Date;
	creatorName: string;
	creatorAvatarUrl?: string | null;
	comments: Array<{
		id: string;
		body: string;
		authorName?: string | null;
		authorAvatarUrl?: string | null;
		createdAt: Date;
		externalUrl?: string | null;
	}>;
}

export function ActivitySection({
	createdAt,
	creatorName,
	creatorAvatarUrl,
	comments,
}: ActivitySectionProps) {
	return (
		<div className="space-y-3">
			<ActivityItem
				avatarUrl={creatorAvatarUrl}
				avatarFallback={creatorName.charAt(0).toUpperCase()}
				actorName={creatorName}
				action="created the issue"
				timestamp={createdAt}
			/>
			{comments.map((comment) => (
				<ActivityItem
					key={comment.id}
					avatarUrl={comment.authorAvatarUrl}
					avatarFallback={(comment.authorName ?? "U").charAt(0).toUpperCase()}
					actorName={comment.authorName ?? "Unknown"}
					action="commented"
					timestamp={comment.createdAt}
					body={comment.body}
					externalUrl={comment.externalUrl}
				/>
			))}
		</div>
	);
}
