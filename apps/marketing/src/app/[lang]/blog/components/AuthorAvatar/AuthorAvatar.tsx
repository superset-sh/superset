import Image from "next/image";

const SIZE_CONFIG = {
	sm: { container: "size-6", text: "size-6 text-[10px]", imgSize: "24px" },
	md: { container: "size-8", text: "size-8 text-xs", imgSize: "32px" },
	lg: { container: "size-12", text: "size-12 text-sm", imgSize: "48px" },
};

interface AuthorAvatarProps {
	name: string;
	avatar?: string;
	size?: "sm" | "md" | "lg";
}

export function AuthorAvatar({ name, avatar, size = "md" }: AuthorAvatarProps) {
	const initials = name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	const config = SIZE_CONFIG[size];

	if (avatar) {
		return (
			<div
				className={`${config.container} relative rounded-full overflow-hidden flex-shrink-0`}
			>
				<Image
					src={avatar}
					alt={name}
					fill
					className="object-cover"
					sizes={config.imgSize}
				/>
			</div>
		);
	}

	return (
		<div
			className={`${config.text} rounded-full bg-muted flex items-center justify-center font-medium text-foreground/70 flex-shrink-0`}
		>
			{initials}
		</div>
	);
}
