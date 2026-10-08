import { Trans } from "@lingui/react/macro";
import { LuChevronRight } from "react-icons/lu";

interface TaskRecordTopBarProps {
	task: { slug: string };
	onBack: () => void;
}

export function TaskRecordTopBar({ task, onBack }: TaskRecordTopBarProps) {
	return (
		<>
			<button
				type="button"
				onClick={onBack}
				className="text-muted-foreground hover:text-foreground"
			>
				<Trans>Tasks</Trans>
			</button>
			<LuChevronRight className="size-3 text-muted-foreground" />
			<span className="min-w-0 truncate font-mono">{task.slug}</span>
		</>
	);
}
