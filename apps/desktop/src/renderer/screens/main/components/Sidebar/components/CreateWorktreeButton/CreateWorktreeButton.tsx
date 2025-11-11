import { Button } from "@superset/ui/button";
import { Cloud, Loader2, Plus } from "lucide-react";

interface CreateWorktreeButtonProps {
	onClick: () => void;
	onCreateCloud?: () => void;
	isCreating: boolean;
	isCreatingCloud?: boolean;
}

export function CreateWorktreeButton({
	onClick,
	onCreateCloud,
	isCreating,
	isCreatingCloud = false,
}: CreateWorktreeButtonProps) {
	return (
		<div className="flex gap-2 mt-2">
			<Button
				variant="ghost"
				size="sm"
				onClick={onClick}
				disabled={isCreating || isCreatingCloud}
				className="flex-1 h-7 px-2.5 font-normal text-xs border border-dashed border-neutral-700/50 hover:bg-neutral-800/40 hover:border-neutral-600 text-neutral-400 hover:text-neutral-300 gap-1.5"
				style={{ justifyContent: "flex-start" }}
			>
				{isCreating && !isCreatingCloud ? (
					<Loader2 size={13} className="animate-spin" />
				) : (
					<Plus size={13} />
				)}
				<span>
					{isCreating && !isCreatingCloud ? "Creating..." : "New Worktree"}
				</span>
			</Button>

			{onCreateCloud && (
				<Button
					variant="ghost"
					size="sm"
					onClick={onCreateCloud}
					disabled={isCreating || isCreatingCloud}
					className="flex-1 h-7 px-2.5 font-normal text-xs border border-dashed border-blue-700/50 hover:bg-blue-800/40 hover:border-blue-600 text-blue-400 hover:text-blue-300 gap-1.5"
					style={{ justifyContent: "flex-start" }}
				>
					{isCreatingCloud ? (
						<Loader2 size={13} className="animate-spin" />
					) : (
						<Cloud size={13} />
					)}
					<span>{isCreatingCloud ? "Creating..." : "New Cloud Worktree"}</span>
				</Button>
			)}
		</div>
	);
}
