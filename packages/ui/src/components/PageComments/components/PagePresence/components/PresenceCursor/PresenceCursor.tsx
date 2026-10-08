interface PresenceCursorProps {
	x: number;
	y: number;
	name: string;
	color: string;
}

export function PresenceCursor({ x, y, name, color }: PresenceCursorProps) {
	return (
		<div
			className="absolute top-0 left-0 transition-transform duration-75 ease-linear"
			style={{ transform: `translate(${x}px, ${y}px)` }}
		>
			<svg
				aria-hidden="true"
				width="13"
				height="20"
				viewBox="0 0 13 20"
				className="drop-shadow-sm"
			>
				<path
					d="M1 1v15.5l3.9-3.8 2.5 5.8 2.3-1-2.5-5.7h5.2z"
					fill="black"
					stroke="white"
					strokeWidth="1"
					strokeLinejoin="round"
				/>
			</svg>
			<span
				className="absolute top-3.5 left-3.5 max-w-40 truncate rounded-sm px-2 py-0.5 font-medium text-xs text-white leading-4 shadow-sm"
				style={{ backgroundColor: color }}
			>
				{name}
			</span>
		</div>
	);
}
