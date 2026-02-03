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
		<div className="flex items-center h-full">
			<button
				type="button"
				className="h-full w-12 flex items-center justify-center hover:bg-accent transition-colors"
				onClick={handleMinimize}
			>
				<HiMiniMinus className="h-4 w-4" />
			</button>
			<button
				type="button"
				className="h-full w-12 flex items-center justify-center hover:bg-accent transition-colors"
				onClick={handleMaximize}
			>
				<HiMiniStop className="h-3 w-3" />
			</button>
			<button
				type="button"
				className="h-full w-12 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
				onClick={handleClose}
			>
				<HiMiniXMark className="h-4 w-4" />
			</button>
		</div>
	);
}
