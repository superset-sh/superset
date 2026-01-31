import { StatusIcon } from "../../StatusIcon";

interface BacklogIconProps {
	color?: string;
	className?: string;
}

export function BacklogIcon({
	color = "currentColor",
	className,
}: BacklogIconProps) {
	return <StatusIcon type="backlog" color={color} className={className} />;
}
