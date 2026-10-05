import { Trans } from "@lingui/react/macro";
import { LuChevronRight } from "react-icons/lu";
import { TaskProjectIcon } from "renderer/routes/_authenticated/_dashboard/components/TaskProjectIcon";

interface ProjectRecordTopBarProps {
	name: string;
	icon: string | null;
	color: string | null;
	onBack: () => void;
}

export function ProjectRecordTopBar({
	name,
	icon,
	color,
	onBack,
}: ProjectRecordTopBarProps) {
	return (
		<>
			<button
				type="button"
				onClick={onBack}
				className="text-muted-foreground hover:text-foreground"
			>
				<Trans>Projects</Trans>
			</button>
			<LuChevronRight className="size-3 text-muted-foreground" />
			<TaskProjectIcon icon={icon} color={color} />
			<span className="min-w-0 truncate">{name}</span>
		</>
	);
}
