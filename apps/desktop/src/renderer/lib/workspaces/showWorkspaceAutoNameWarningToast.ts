import { toast } from "@superset/ui/sonner";

export function showWorkspaceAutoNameWarningToast({
	description,
	onOpenModelAuthSettings,
}: {
	description: string;
	onOpenModelAuthSettings: () => void;
}) {
	toast.warning("Workspace used a fallback name", {
		description,
		// Give users time to read the warning and click through to settings.
		duration: 15_000,
		action: {
			label: "Open Models",
			onClick: onOpenModelAuthSettings,
		},
	});
}
