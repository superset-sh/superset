import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { HiPencil, HiTrash, HiXMark } from "react-icons/hi2";
import type { DiffComment } from "renderer/stores/diff-comments";

interface InlineCommentProps {
	comment: DiffComment;
	onDelete: (commentId: string) => void;
	onEdit: (commentId: string, text: string) => void;
}

export function InlineComment({
	comment,
	onDelete,
	onEdit,
}: InlineCommentProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editText, setEditText] = useState(comment.text);

	const handleSave = () => {
		if (!editText.trim()) return;
		onEdit(comment.id, editText.trim());
		setIsEditing(false);
	};

	const handleCancel = () => {
		setEditText(comment.text);
		setIsEditing(false);
	};

	const timeAgo = getTimeAgo(comment.createdAt);

	return (
		<div className="group/comment flex flex-col gap-1 px-3 py-2 bg-muted/30 border-b border-border last:border-b-0">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
					<span className="font-medium text-foreground">{comment.author}</span>
					<span>on line {comment.lineNumber}</span>
					<span>·</span>
					<span>{timeAgo}</span>
				</div>
				<div className="flex items-center gap-0.5 opacity-0 group-hover/comment:opacity-100 transition-opacity">
					<Button
						variant="ghost"
						size="icon"
						className="h-5 w-5"
						onClick={() => setIsEditing(true)}
					>
						<HiPencil className="size-3" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-5 w-5 text-destructive"
						onClick={() => onDelete(comment.id)}
					>
						<HiTrash className="size-3" />
					</Button>
				</div>
			</div>
			{isEditing ? (
				<div className="flex flex-col gap-1.5">
					<Textarea
						value={editText}
						onChange={(e) => setEditText(e.target.value)}
						className="min-h-[40px] text-[11px] resize-none bg-background"
						autoFocus
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								handleSave();
							}
							if (e.key === "Escape") {
								handleCancel();
							}
						}}
					/>
					<div className="flex items-center gap-1 justify-end">
						<Button
							variant="ghost"
							size="sm"
							className="h-5 text-[10px] px-2"
							onClick={handleCancel}
						>
							<HiXMark className="size-3 mr-0.5" />
							Cancel
						</Button>
						<Button
							size="sm"
							className="h-5 text-[10px] px-2"
							onClick={handleSave}
							disabled={!editText.trim()}
						>
							Save
						</Button>
					</div>
				</div>
			) : (
				<p className="text-[11px] text-foreground whitespace-pre-wrap">
					{comment.text}
				</p>
			)}
		</div>
	);
}

function getTimeAgo(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
