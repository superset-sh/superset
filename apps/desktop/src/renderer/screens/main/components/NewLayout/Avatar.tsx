import type React from "react";

interface AvatarProps {
	imageUrl: string;
	name: string;
	size?: number;
}

export const Avatar: React.FC<AvatarProps> = ({
	imageUrl,
	name,
	size = 32,
}) => {
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
