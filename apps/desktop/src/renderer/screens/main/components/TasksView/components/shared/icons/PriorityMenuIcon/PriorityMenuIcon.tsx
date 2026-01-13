import { PriorityIcon } from "../../PriorityIcon";

interface PriorityMenuIconProps {
	className?: string;
	color?: string;
}

export function PriorityMenuIcon({
	className,
	color = "currentColor",
}: PriorityMenuIconProps) {
	return <PriorityIcon priority="urgent" className={className} color={color} />;
}
