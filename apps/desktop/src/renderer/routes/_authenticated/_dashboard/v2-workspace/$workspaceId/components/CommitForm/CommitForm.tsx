import { Trans } from "@lingui/react/macro";
import { Textarea } from "@superset/ui/textarea";
import { VscLoading } from "react-icons/vsc";
import type { ShipActions } from "../../hooks/useShipActions";

interface CommitFormProps {
	actions: ShipActions;
}

export function CommitForm({ actions }: CommitFormProps) {
	return (
		<div className="flex flex-col gap-2">
			<Textarea
				autoFocus
				value={actions.commitMessage}
				onChange={(e) => actions.setCommitMessage(e.target.value)}
				placeholder={actions.defaultCommitMessage}
				className="min-h-20 text-xs"
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						actions.commit();
					}
				}}
			/>
			<button
				type="button"
				onClick={actions.commit}
				disabled={actions.isCommitting}
				className="flex h-7 items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{actions.isCommitting && (
					<VscLoading className="size-3.5 animate-spin" />
				)}
				<Trans>Commit</Trans>
			</button>
		</div>
	);
}
