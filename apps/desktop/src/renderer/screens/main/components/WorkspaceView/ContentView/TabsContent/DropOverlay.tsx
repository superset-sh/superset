interface DropOverlayProps {
	message: string;
}

export function DropOverlay({ message }: DropOverlayProps) {
	return (
		<div className="absolute inset-0 bg-primary/10 border-2 border-primary/20 border-dashed rounded-lg flex items-center justify-center pointer-events-none">
			<div className="bg-background/80 px-6 py-4 rounded-lg border border-primary/10 shadow-lg">
				<p className="text-primary font-semibold text-lg">{message}</p>
			</div>
		</div>
	);
}
