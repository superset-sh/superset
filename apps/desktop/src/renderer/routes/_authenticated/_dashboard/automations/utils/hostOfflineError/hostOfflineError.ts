import { toast } from "@superset/ui/sonner";

const HOST_OFFLINE_ERROR = "target host offline";

export const HOST_OFFLINE_HELP =
	"The host isn't connected to the Superset relay. If it's this device, turn on \"Allow remote workspaces to access this device via relay\" in Settings > Security, then try again.";

export function isHostOfflineError(error: string | null | undefined): boolean {
	return !!error?.includes(HOST_OFFLINE_ERROR);
}

export function showRunNowErrorToast(
	error: unknown,
	openSecuritySettings: () => void,
): void {
	const message = error instanceof Error ? error.message : null;
	if (isHostOfflineError(message)) {
		toast.error("Target host is offline", {
			description: HOST_OFFLINE_HELP,
			action: { label: "Open settings", onClick: openSecuritySettings },
		});
		return;
	}
	toast.error(message ?? "Failed to trigger run");
}
