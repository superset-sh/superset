import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { EnvironmentEditorDialog } from "renderer/routes/_authenticated/components/EnvironmentEditorDialog";
import { useSaveAsEnvironmentIntent } from "renderer/stores/save-as-environment-intent";

export function SaveAsEnvironmentMount() {
	const organizationId = useActiveOrganizationId();
	const workspaceId = useSaveAsEnvironmentIntent((state) => state.workspaceId);
	const close = useSaveAsEnvironmentIntent((state) => state.close);
	if (!workspaceId || !organizationId) return null;
	return (
		<EnvironmentEditorDialog
			key={workspaceId}
			organizationId={organizationId}
			fromWorkspaceId={workspaceId}
			open
			onOpenChange={(open) => {
				if (!open) close();
			}}
		/>
	);
}
