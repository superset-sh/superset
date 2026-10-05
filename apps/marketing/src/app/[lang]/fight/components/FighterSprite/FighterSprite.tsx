import { Pixabot } from "@pixabots/react";
import { avatarId } from "@/app/[lang]/utils/avatarUrl";
import type { FrameName } from "./frames";

interface FighterSpriteProps {
	frame: FrameName;
	identity?: string;
	rgb: string;
	facing: "left" | "right";
	className?: string;
	style?: React.CSSProperties;
	flash?: boolean;
	title: string;
}

export function FighterSprite({
	frame,
	identity = "superset",
	rgb,
	facing,
	className = "",
	style,
	flash = false,
	title,
}: FighterSpriteProps) {
	const attacking = frame === "bite" || frame === "roar";
	const running = frame === "run1" || frame === "run3";
	return (
		<Pixabot
			id={avatarId(identity)}
			size={256}
			animated={false}
			alt={title}
			className={className}
			style={{
				...style,
				transform: [
					facing === "left" ? "scaleX(-1)" : "",
					attacking ? "rotate(-8deg) scale(1.06)" : "",
					running ? "translateY(-4px)" : "",
					style?.transform ?? "",
				]
					.filter(Boolean)
					.join(" "),
				filter: flash
					? "brightness(0) invert(1) drop-shadow(0 0 10px rgba(255,255,255,0.7))"
					: `drop-shadow(0 3px 0 rgba(0,0,0,0.45)) drop-shadow(0 0 12px rgba(${rgb},0.12))`,
			}}
		/>
	);
}
