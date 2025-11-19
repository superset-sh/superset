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
	// If no image URL, show initials
	if (!imageUrl) {
		const initials = name
			.split(" ")
			.map((word) => word[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);

		return (
			<div
				className="rounded-full flex items-center justify-center bg-neutral-700 text-neutral-200 shrink-0"
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
