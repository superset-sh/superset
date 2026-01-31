import { toast } from "@superset/ui/sonner";
import { HiMiniMicrophone } from "react-icons/hi2";

interface RecordingIndicatorProps {
	toastId: string | number;
}

export function RecordingIndicator({ toastId }: RecordingIndicatorProps) {
	return (
		<div className="flex items-center gap-2 rounded-full bg-popover text-popover-foreground border border-border px-4 py-2 shadow-lg">
			<span className="relative flex size-3">
				<span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
				<span className="relative inline-flex size-3 rounded-full bg-red-500" />
			</span>
			<HiMiniMicrophone className="size-4 text-red-500" />
			<span className="text-sm font-medium">Listening...</span>
			<button
				type="button"
				onClick={() => toast.dismiss(toastId)}
				className="ml-1 text-xs text-muted-foreground hover:text-foreground"
			>
				Cancel
			</button>
		</div>
	);
}
