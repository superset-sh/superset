import { Button } from "@superset/ui/button";
import { Plus } from "lucide-react";

interface CreateWorktreeButtonProps {
	onClick: () => void;
	isCreating: boolean;
}

export function CreateWorktreeButton({
	onClick,
	isCreating,
}: CreateWorktreeButtonProps) {
	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={onClick}
			disabled={isCreating}
			className="w-full h-7 px-2.5 font-normal text-xs border border-dashed border-neutral-700/50 mt-2 hover:bg-neutral-800/40 hover:border-neutral-600 text-neutral-400 hover:text-neutral-300 gap-1.5"
			style={{ justifyContent: "flex-start" }}
		>
			<Plus size={13} />
			<span>{isCreating ? "Creating..." : "New Worktree"}</span>
		</Button>
	);
}
