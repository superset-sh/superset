export function Pixel404() {
	const s = 14;
	const g = 16;

	const d4a: [number, number][] = [
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
	const d0: [number, number][] = [
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
	const d4b: [number, number][] = [
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

	const pixels = [...d4a, ...d0, ...d4b];

	return (
		<svg
			viewBox={`0 0 ${10 * g + s} ${4 * g + s}`}
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className="w-full max-w-[480px]"
			aria-label="404"
		>
			<title>404</title>
			{pixels.map(([col, row]) => (
				<rect
					key={`${col}-${row}`}
					x={col * g}
					y={row * g}
					width={s}
					height={s}
					fill="rgba(255,255,255,0.04)"
					stroke="rgba(255,255,255,0.1)"
					strokeWidth="0.5"
				/>
			))}
		</svg>
	);
}
