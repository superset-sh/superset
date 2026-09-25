import { cn } from "../../lib/utils";

const FOUR_LEFT: [number, number][] = [
	[0, 0],
	[2, 0],
	[0, 1],
	[2, 1],
	[0, 2],
	[1, 2],
	[2, 2],
	[2, 3],
	[2, 4],
];
const ZERO: [number, number][] = [
	[4, 0],
	[5, 0],
	[6, 0],
	[4, 1],
	[6, 1],
	[4, 2],
	[6, 2],
	[4, 3],
	[6, 3],
	[4, 4],
	[5, 4],
	[6, 4],
];
const FOUR_RIGHT: [number, number][] = [
	[8, 0],
	[10, 0],
	[8, 1],
	[10, 1],
	[8, 2],
	[9, 2],
	[10, 2],
	[10, 3],
	[10, 4],
];

const PIXELS = [...FOUR_LEFT, ...ZERO, ...FOUR_RIGHT];
const SIZE = 14;
const PITCH = 16;

export function Pixel404({ className }: { className?: string }) {
	return (
		<svg
			viewBox={`0 0 ${10 * PITCH + SIZE} ${4 * PITCH + SIZE}`}
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={cn("w-full max-w-[480px]", className)}
			aria-label="404"
		>
			<title>404</title>
			{PIXELS.map(([col, row]) => (
				<rect
					key={`${col}-${row}`}
					x={col * PITCH}
					y={row * PITCH}
					width={SIZE}
					height={SIZE}
					fill="currentColor"
					fillOpacity={0.04}
					stroke="currentColor"
					strokeOpacity={0.1}
					strokeWidth="0.5"
				/>
			))}
		</svg>
	);
}
