import { FRAMES, type FrameName, SPRITE_SIZE } from "./frames";

interface DinoSpriteProps {
	frame: FrameName;
	rgb: string;
	facing: "left" | "right";
	className?: string;
	style?: React.CSSProperties;
	flash?: boolean;
	title: string;
}

export function DinoSprite({
	frame,
	rgb,
	facing,
	className = "",
	style,
	flash = false,
	title,
}: DinoSpriteProps) {
	const rows = FRAMES[frame];
	const pixels: Array<{ x: number; y: number }> = [];

	rows.forEach((row, y) => {
		for (let x = 0; x < row.length; x++) {
			if (row[x] === "#") pixels.push({ x, y });
		}
	});

	const fill = flash ? "rgb(255,255,255)" : `rgb(${rgb})`;

	return (
		<svg
			viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
			className={className}
			shapeRendering="crispEdges"
			style={{
				...style,
				transform: [
					facing === "left" ? "scaleX(-1)" : "",
					style?.transform ?? "",
				]
					.filter(Boolean)
					.join(" "),
				filter: flash
					? "drop-shadow(0 0 10px rgba(255,255,255,0.9))"
					: `drop-shadow(0 0 7px rgba(${rgb},0.4))`,
			}}
			role="img"
			aria-label={title}
		>
			<title>{title}</title>
			{pixels.map((pixel) => (
				<rect
					key={`${pixel.x}-${pixel.y}`}
					x={pixel.x}
					y={pixel.y}
					width={1}
					height={1}
					fill={fill}
				/>
			))}
		</svg>
	);
}
