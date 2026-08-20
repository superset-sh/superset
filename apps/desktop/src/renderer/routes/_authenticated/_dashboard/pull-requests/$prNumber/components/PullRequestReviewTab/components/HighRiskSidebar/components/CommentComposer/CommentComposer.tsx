import { LuArrowUp, LuPlus } from "react-icons/lu";

/**
 * Visually complete but inert — there's no comment-write path wired up yet.
 */
export function CommentComposer() {
	return (
		<div className="flex flex-col gap-2 rounded-xl bg-background p-3 ring-1 ring-border">
			<textarea
				disabled
				placeholder="Leave a comment"
				rows={3}
				className="w-full resize-none bg-transparent text-[13px] text-muted-foreground placeholder:text-muted-foreground focus:outline-none"
			/>
			<div className="flex items-center justify-end gap-1">
				<button
					type="button"
					disabled
					aria-label="Attach"
					className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground disabled:opacity-60"
				>
					<LuPlus className="size-4" />
				</button>
				<button
					type="button"
					disabled
					aria-label="Send comment"
					className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground disabled:opacity-60"
				>
					<LuArrowUp className="size-4" />
				</button>
			</div>
		</div>
	);
}
