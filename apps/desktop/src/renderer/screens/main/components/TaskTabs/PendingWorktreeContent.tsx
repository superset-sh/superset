import { Loader2 } from "lucide-react";
import type React from "react";

export const PendingWorktreeContent: React.FC = () => (
	<div className="space-y-2">
		<div className="flex items-center gap-2">
			<Loader2 size={16} className="animate-spin text-blue-400" />
			<h4 className="font-semibold text-sm text-white">Creating worktree...</h4>
		</div>
		<p className="text-xs text-neutral-400">
			Setting up git worktree and initializing workspace
		</p>
	</div>
);
