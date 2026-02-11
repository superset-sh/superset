interface CommentInputProps {
	placeholder?: string;
}

export function CommentInput({
	placeholder = "Leave a comment...",
}: CommentInputProps) {
	return (
		<div className="border border-border rounded-lg p-3 text-sm text-muted-foreground cursor-text hover:border-muted-foreground/50 transition-colors">
			{placeholder}
		</div>
	);
}
