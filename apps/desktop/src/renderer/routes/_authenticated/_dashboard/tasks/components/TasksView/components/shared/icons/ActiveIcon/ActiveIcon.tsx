import { StatusIcon } from "../../StatusIcon";

interface ActiveIconProps {
	color?: string;
	className?: string;
}

export function ActiveIcon({
	color = "currentColor",
	className,
}: ActiveIconProps) {
	return (
		<StatusIcon
			type="started"
			color={color}
			progress={50}
			className={className}
		/>
	);
}
