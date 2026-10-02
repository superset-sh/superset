import { Trans } from "@lingui/react/macro";
import { LuChevronRight } from "react-icons/lu";
import {
	type TaskIdentity,
	useTaskDisplayId,
} from "renderer/hooks/useTaskDisplayId";

interface TaskRecordTopBarProps {
	task: TaskIdentity;
	onBack: () => void;
}

export function TaskRecordTopBar({ task, onBack }: TaskRecordTopBarProps) {
	const taskDisplayId = useTaskDisplayId();
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
			<span className="min-w-0 truncate font-mono">{taskDisplayId(task)}</span>
		</>
	);
}
