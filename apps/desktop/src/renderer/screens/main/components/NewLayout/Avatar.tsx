import type React from "react";

interface AvatarProps {
	imageUrl: string | null;
	name: string;
	size?: number;
}

export const Avatar: React.FC<AvatarProps> = ({
	imageUrl,
	name,
	size = 32,
}) => {
	// Generate a simple initial-based fallback
	const initials = name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	if (!imageUrl) {
		return (
			<div
				className="rounded-full bg-neutral-700 flex items-center justify-center text-white text-xs font-medium shrink-0"
				style={{
					width: size,
					height: size,
					fontSize: size * 0.4,
				}}
			>
				{initials}
			</div>
		);
	}

	return (
		<img
			src={imageUrl}
			alt={name}
			className="rounded-full object-cover shrink-0"
			style={{
				width: size,
				height: size,
			}}
		/>
	);
};
