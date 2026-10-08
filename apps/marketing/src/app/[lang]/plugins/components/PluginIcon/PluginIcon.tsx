import Image from "next/image";
import { GLYPH_ICONS, IMAGE_ICONS } from "./constants";

interface PluginIconProps {
	name: string;
	size?: "sm" | "md";
}

export function PluginIcon({ name, size = "md" }: PluginIconProps) {
	const tile = size === "sm" ? "size-7 rounded-md" : "size-9 rounded-lg";
	const mark = size === "sm" ? 14 : 18;
	const image = IMAGE_ICONS[name];
	const glyph = GLYPH_ICONS[name];

	return (
		<span
			aria-hidden="true"
			className={`flex shrink-0 items-center justify-center border border-border bg-muted/40 text-foreground ${tile}`}
		>
			{image ? (
				<Image src={image} alt="" width={mark} height={mark} />
			) : glyph ? (
				<glyph.icon style={{ width: mark, height: mark, color: glyph.color }} />
			) : null}
		</span>
	);
}
