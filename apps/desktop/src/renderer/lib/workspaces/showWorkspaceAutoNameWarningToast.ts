import { toast } from "@superset/ui/sonner";

export function showWorkspaceAutoNameWarningToast({
	description,
}: {
	description: string;
}) {
	toast.warning("Workspace used a fallback name", {
		description,
		// Give users time to read the warning before it clears itself.
		duration: 15_000,
	});
}
