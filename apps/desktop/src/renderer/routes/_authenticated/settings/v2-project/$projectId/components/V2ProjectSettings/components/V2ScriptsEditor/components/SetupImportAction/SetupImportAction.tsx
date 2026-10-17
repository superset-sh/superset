import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useState } from "react";
import { HiArrowDownTray } from "react-icons/hi2";
import { useSetupImportCandidates } from "renderer/hooks/host-service/useSetupImportCandidates";
import { ImportSetupDialog } from "renderer/routes/_authenticated/components/ImportSetupDialog";

interface SetupImportActionProps {
	hostUrl: string;
	projectId: string;
}

export function SetupImportAction({
	hostUrl,
	projectId,
}: SetupImportActionProps) {
	const { candidates, configInvalid } = useSetupImportCandidates({
		hostUrl,
		projectId,
	});
	const [isOpen, setIsOpen] = useState(false);

	const first = candidates[0];
	if (!first && !isOpen) return null;
	const label = first?.label;

	return (
		<>
			<Button
				size="sm"
				variant="ghost"
				className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
				onClick={() => setIsOpen(true)}
			>
				<HiArrowDownTray className="size-3.5" />
				{candidates.length > 1 || !label ? (
					<Trans>Import from another tool</Trans>
				) : (
					<Trans>Import from {label}</Trans>
				)}
			</Button>
			<ImportSetupDialog
				open={isOpen}
				onOpenChange={setIsOpen}
				hostUrl={hostUrl}
				projectId={projectId}
				candidates={candidates}
				configInvalid={configInvalid}
			/>
		</>
	);
}
