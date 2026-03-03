interface CommentInputProps {
	placeholder?: string;
	disabled?: boolean;
}

export function CommentInput({
	placeholder = "Leave a comment...",
	disabled = false,
}: CommentInputProps) {
	return (
		<div className="border border-border rounded-lg p-3 text-sm text-muted-foreground">
			{disabled
				? "Commenting from Superset is coming soon. New comments sync automatically from Linear."
				: placeholder}
		</div>
	);
}
