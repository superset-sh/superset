const FLOOR_GRID =
	"linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)";

const FLOOR_FADE = "linear-gradient(to bottom, black, transparent 62%)";

const BRAND_RGB = "210,86,17";

const guideLines = (halfWidth: number) =>
	`linear-gradient(to right, transparent calc(50% - ${halfWidth}px), rgba(255,255,255,0.07) calc(50% - ${halfWidth}px), rgba(255,255,255,0.07) calc(50% - ${halfWidth - 1}px), transparent calc(50% - ${halfWidth - 1}px), transparent calc(50% + ${halfWidth - 1}px), rgba(255,255,255,0.07) calc(50% + ${halfWidth - 1}px), rgba(255,255,255,0.07) calc(50% + ${halfWidth}px), transparent calc(50% + ${halfWidth}px))`;

const furnaceGlow = (rgb: string) =>
	`radial-gradient(ellipse 62% 100% at 50% 0%, rgba(${rgb},0.14), rgba(${rgb},0.035) 45%, transparent 72%)`;

interface FactoryBackdropProps {
	tint?: string;
	halfWidth?: number;
}

export function FactoryBackdrop({
	tint = BRAND_RGB,
	halfWidth = 448,
}: FactoryBackdropProps) {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 overflow-hidden"
		>
			<div
				className="absolute inset-0"
				style={{
					backgroundImage: FLOOR_GRID,
					backgroundSize: "32px 32px",
					maskImage: FLOOR_FADE,
					WebkitMaskImage: FLOOR_FADE,
				}}
			/>
			<div
				className="absolute inset-x-0 top-0 h-[620px]"
				style={{ backgroundImage: furnaceGlow(tint) }}
			/>
			<div
				className="absolute inset-0"
				style={{ backgroundImage: guideLines(halfWidth) }}
			/>
			<div
				className="absolute inset-x-0 top-0 h-px"
				style={{
					backgroundImage: `linear-gradient(to right, transparent, rgba(${tint},0.55), transparent)`,
				}}
			/>
		</div>
	);
}
