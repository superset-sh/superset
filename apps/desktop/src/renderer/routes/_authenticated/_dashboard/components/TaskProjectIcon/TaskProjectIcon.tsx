import { cn } from "@superset/ui/utils";
import { PiStackSimpleFill } from "react-icons/pi";
import { useProjectIcons } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectIcons";

interface TaskProjectIconProps {
	color: string | null;
	icon?: string | null;
	className?: string;
}

export function TaskProjectIcon({
	color,
	icon = null,
	className,
}: TaskProjectIconProps) {
	const icons = useProjectIcons();
	const style = color ? { color } : undefined;
	const classes = cn("size-3.5 shrink-0 text-muted-foreground", className);
	if (!icon) return <PiStackSimpleFill className={classes} style={style} />;
	const Icon = icons?.[icon];
	if (!Icon) return <span className={classes} />;
	return <Icon className={classes} style={style} />;
}
