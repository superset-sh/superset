import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export function UserAvatar({
	name,
	image,
	className,
	textClassName,
}: {
	name: string;
	image?: string | null;
	className?: string;
	textClassName?: string;
}) {
	const initials = name
		.split(" ")
		.map((part) => part[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
	return (
		<Avatar alt={name} className={cn("size-9", className)}>
			{image ? <AvatarImage source={{ uri: image }} /> : null}
			<AvatarFallback>
				<Text className={cn("text-xs", textClassName)}>{initials}</Text>
			</AvatarFallback>
		</Avatar>
	);
}
