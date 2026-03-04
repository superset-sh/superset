export function GridCross({ className }: { className?: string }) {
	return (
		<div className={`absolute overflow-hidden ${className}`}>
			<div className="absolute -translate-x-1/2 -translate-y-1/2 w-px h-4 bg-border" />
			<div className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-px bg-border" />
		</div>
	);
}
