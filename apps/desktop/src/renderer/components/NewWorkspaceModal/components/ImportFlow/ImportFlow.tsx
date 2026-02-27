import type { ReactNode } from "react";
import { ExistingWorktreesList } from "../ExistingWorktreesList";

interface ImportFlowProps {
	projectId: string;
	projectSelector: ReactNode;
	onOpenSuccess: () => void;
}

export function ImportFlow({
	projectId,
	projectSelector,
	onOpenSuccess,
}: ImportFlowProps) {
	return (
		<div className="space-y-3">
			<div>{projectSelector}</div>
			<ExistingWorktreesList
				projectId={projectId}
				onOpenSuccess={onOpenSuccess}
			/>
		</div>
	);
}
