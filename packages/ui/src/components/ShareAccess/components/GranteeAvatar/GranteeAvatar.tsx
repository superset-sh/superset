import { getInitials } from "@superset/shared/names";
import { UserPlus, Users } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../../../ui/avatar";

type GranteeAvatarProps = {
	size?: "sm" | "md";
	className?: string;
} & (
	| { kind: "person"; name: string; image: string | null }
	| { kind: "team" }
	| { kind: "invite" }
);

export function GranteeAvatar(props: GranteeAvatarProps) {
	const sizeClass = props.size === "sm" ? "size-4" : "size-7";
	const iconClass = props.size === "sm" ? "size-2.5" : "size-3.5";

	if (props.kind === "person") {
		return (
			<Avatar className={cn(sizeClass, props.className)}>
				{props.image ? <AvatarImage src={props.image} /> : null}
				<AvatarFallback
					className={props.size === "sm" ? "text-[8px]" : "text-[10px]"}
				>
					{getInitials(props.name) || "?"}
				</AvatarFallback>
			</Avatar>
		);
	}

	return (
		<span
			className={cn(
				"grid shrink-0 place-items-center text-muted-foreground",
				props.kind === "team"
					? "rounded-md bg-muted"
					: "rounded-full border border-dashed border-muted-foreground/60",
				sizeClass,
				props.className,
			)}
		>
			{props.kind === "team" ? (
				<Users className={iconClass} />
			) : (
				<UserPlus className={iconClass} />
			)}
		</span>
	);
}
