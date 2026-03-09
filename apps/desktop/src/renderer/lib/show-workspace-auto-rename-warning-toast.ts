import { toast } from "@superset/ui/sonner";
import {
	getWorkspaceAutoRenameWarningContent,
	type WorkspaceAutoRenameWarning,
} from "shared/workspace-auto-rename-warning";

export function showWorkspaceAutoRenameWarningToast({
	warning,
	onOpenApiKeys,
}: {
	warning: WorkspaceAutoRenameWarning;
	onOpenApiKeys?: () => void;
}) {
	const content = getWorkspaceAutoRenameWarningContent(warning.reason);

	toast.warning(content.title, {
		description: content.description,
		...(onOpenApiKeys && content.primaryActionLabel
			? {
					action: {
						label: content.primaryActionLabel,
						onClick: onOpenApiKeys,
					},
				}
			: {}),
	});
}
