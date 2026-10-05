import { useLingui } from "@lingui/react/macro";
import { HiMiniXMark } from "react-icons/hi2";
import type { CloudTask } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskRow";
import { CloudTaskRow } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskRow";

interface LinkedTaskRowProps {
	task: CloudTask;
	onOpen: () => void;
	onUnlink: () => void;
}

export function LinkedTaskRow({ task, onOpen, onUnlink }: LinkedTaskRowProps) {
	const { t } = useLingui();
	return (
		<CloudTaskRow
			task={task}
			onOpen={onOpen}
			trailing={
				<button
					type="button"
					onClick={onUnlink}
					aria-label={t({ message: "Unlink task" })}
					className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
				>
					<HiMiniXMark className="size-3.5" />
				</button>
			}
		/>
	);
}
