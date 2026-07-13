const HOST_OFFLINE_ERROR = "target host offline";

export const HOST_OFFLINE_HELP =
	"The host isn't connected to the Superset relay. If it's this device, turn on \"Allow remote workspaces to access this device via relay\" in Settings > Security, then try again.";

export function isHostOfflineError(error: string | null | undefined): boolean {
	return !!error?.includes(HOST_OFFLINE_ERROR);
}
