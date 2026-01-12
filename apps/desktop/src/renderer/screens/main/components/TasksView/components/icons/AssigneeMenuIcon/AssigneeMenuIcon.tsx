import { HiOutlineUserCircle } from "react-icons/hi2";

interface AssigneeMenuIconProps {
	color?: string;
	className?: string;
}

export function AssigneeMenuIcon({
	color = "currentColor",
	className,
}: AssigneeMenuIconProps) {
	return <HiOutlineUserCircle className={className} style={{ color }} />;
}
