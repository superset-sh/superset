import { HiMiniMinus, HiMiniStop, HiMiniXMark } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function WindowControls() {
	const minimizeMutation = electronTrpc.window.minimize.useMutation();
	const maximizeMutation = electronTrpc.window.maximize.useMutation();
	const closeMutation = electronTrpc.window.close.useMutation();

	const handleMinimize = () => {
		minimizeMutation.mutate();
	};

	const handleMaximize = () => {
		maximizeMutation.mutate();
	};

	const handleClose = () => {
		closeMutation.mutate();
	};

	return (
		<div className="no-drag flex items-center h-full gap-1 pr-1">
			<button
				type="button"
				aria-label="Minimize window"
				className="no-drag flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onClick={handleMinimize}
			>
				<HiMiniMinus className="h-3.5 w-3.5" />
			</button>
			<button
				type="button"
				aria-label="Maximize window"
				className="no-drag flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onClick={handleMaximize}
			>
				<HiMiniStop className="h-3 w-3" />
			</button>
			<button
				type="button"
				aria-label="Close window"
				className="no-drag flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
				onClick={handleClose}
			>
				<HiMiniXMark className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}
