interface Comment {
	id: string;
	authorLogin: string;
	avatarUrl?: string;
	body: string;
	createdAt?: number;
}

interface CommentThreadProps {
	threadId: string;
	isResolved: boolean;
	comments: Comment[];
}

export function CommentThread({ isResolved, comments }: CommentThreadProps) {
	return (
		<div
			style={{
				padding: 8,
				margin: "4px 8px",
				background: isResolved
					? "rgba(128,128,128,0.08)"
					: "rgba(255,200,0,0.1)",
				border: `1px solid ${isResolved ? "rgba(128,128,128,0.2)" : "rgba(255,200,0,0.3)"}`,
				borderRadius: 6,
				fontSize: 12,
				opacity: isResolved ? 0.6 : 1,
			}}
		>
			{isResolved && (
				<div
					style={{
						fontSize: 10,
						color: "rgba(128,128,128,0.8)",
						marginBottom: 4,
					}}
				>
					Resolved
				</div>
			)}
			{comments.map((comment, i) => (
				<div
					key={comment.id}
					style={{
						paddingTop: i > 0 ? 6 : 0,
						marginTop: i > 0 ? 6 : 0,
						borderTop: i > 0 ? "1px solid rgba(128,128,128,0.15)" : "none",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						{comment.avatarUrl && (
							<img
								src={comment.avatarUrl}
								alt=""
								style={{ width: 16, height: 16, borderRadius: "50%" }}
							/>
						)}
						<strong>{comment.authorLogin}</strong>
					</div>
					<div style={{ marginTop: 3, whiteSpace: "pre-wrap" }}>
						{comment.body}
					</div>
				</div>
			))}
		</div>
	);
}
