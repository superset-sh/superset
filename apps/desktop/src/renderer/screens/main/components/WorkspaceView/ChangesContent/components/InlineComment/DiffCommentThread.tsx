import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { HiChatBubbleLeftRight, HiPaperAirplane } from "react-icons/hi2";
import { useDiffCommentsStore } from "renderer/stores/diff-comments";
import { InlineComment } from "./InlineComment";

interface DiffCommentThreadProps {
	worktreePath: string;
	filePath: string;
}

export function DiffCommentThread({
	worktreePath,
	filePath,
}: DiffCommentThreadProps) {
	const comments = useDiffCommentsStore((s) =>
		s.getFileComments(worktreePath, filePath),
	);
	const { addComment, deleteComment, editComment } = useDiffCommentsStore();

	const [isAdding, setIsAdding] = useState(false);
	const [newText, setNewText] = useState("");
	const [newLine, setNewLine] = useState("");

	const handleAdd = () => {
		if (!newText.trim()) return;
		addComment({
			worktreePath,
			filePath,
			lineNumber: newLine ? Number.parseInt(newLine, 10) : 0,
			side: "modified",
			text: newText.trim(),
		});
		setNewText("");
		setNewLine("");
		setIsAdding(false);
	};

	const handleDelete = (commentId: string) => {
		deleteComment({ worktreePath, filePath, commentId });
	};

	const handleEdit = (commentId: string, text: string) => {
		editComment({ worktreePath, filePath, commentId, text });
	};

	const sortedComments = [...comments].sort(
		(a, b) => a.lineNumber - b.lineNumber || a.createdAt - b.createdAt,
	);

	if (sortedComments.length === 0 && !isAdding) {
		return (
			<div className="flex justify-center py-1.5 border-t border-border bg-muted/20">
				<Button
					variant="ghost"
					size="sm"
					className="h-6 text-[10px] text-muted-foreground gap-1"
					onClick={() => setIsAdding(true)}
				>
					<HiChatBubbleLeftRight className="size-3" />
					Add comment
				</Button>
			</div>
		);
	}

	return (
		<div className="border-t border-border">
			{sortedComments.length > 0 && (
				<div className="divide-y divide-border">
					{sortedComments.map((comment) => (
						<InlineComment
							key={comment.id}
							comment={comment}
							onDelete={handleDelete}
							onEdit={handleEdit}
						/>
					))}
				</div>
			)}

			{isAdding ? (
				<div className="flex flex-col gap-1.5 px-3 py-2 bg-muted/20">
					<div className="flex items-center gap-2">
						<label
							htmlFor="comment-line"
							className="text-[10px] text-muted-foreground shrink-0"
						>
							Line
						</label>
						<input
							id="comment-line"
							type="number"
							min={1}
							value={newLine}
							onChange={(e) => setNewLine(e.target.value)}
							placeholder="#"
							className="h-5 w-14 text-[10px] px-1.5 rounded border border-border bg-background text-foreground"
						/>
					</div>
					<Textarea
						value={newText}
						onChange={(e) => setNewText(e.target.value)}
						placeholder="Add a comment..."
						className="min-h-[40px] text-[11px] resize-none bg-background"
						autoFocus
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								handleAdd();
							}
							if (e.key === "Escape") {
								setIsAdding(false);
								setNewText("");
								setNewLine("");
							}
						}}
					/>
					<div className="flex items-center gap-1 justify-end">
						<Button
							variant="ghost"
							size="sm"
							className="h-5 text-[10px] px-2"
							onClick={() => {
								setIsAdding(false);
								setNewText("");
								setNewLine("");
							}}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							className="h-5 text-[10px] px-2 gap-0.5"
							onClick={handleAdd}
							disabled={!newText.trim()}
						>
							<HiPaperAirplane className="size-3" />
							Comment
						</Button>
					</div>
				</div>
			) : (
				<div className="flex justify-center py-1.5 bg-muted/20">
					<Button
						variant="ghost"
						size="sm"
						className="h-6 text-[10px] text-muted-foreground gap-1"
						onClick={() => setIsAdding(true)}
					>
						<HiChatBubbleLeftRight className="size-3" />
						Add comment
					</Button>
				</div>
			)}
		</div>
	);
}
