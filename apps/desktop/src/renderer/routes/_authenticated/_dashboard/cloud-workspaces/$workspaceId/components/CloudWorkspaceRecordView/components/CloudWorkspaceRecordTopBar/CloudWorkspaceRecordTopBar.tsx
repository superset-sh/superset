import { Trans } from "@lingui/react/macro";
import { LuChevronRight } from "react-icons/lu";

interface CloudWorkspaceRecordTopBarProps {
	name: string;
	onBack: () => void;
}

export function CloudWorkspaceRecordTopBar({
	name,
	onBack,
}: CloudWorkspaceRecordTopBarProps) {
	return (
		<>
			<button
				type="button"
				onClick={onBack}
				className="text-muted-foreground hover:text-foreground"
			>
				<Trans>Workspaces</Trans>
			</button>
			<LuChevronRight className="size-3 text-muted-foreground" />
			<span className="min-w-0 truncate">{name}</span>
		</>
	);
}
