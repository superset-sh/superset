import type {
	shell as electronShell,
	systemPreferences as electronSystemPreferences,
} from "electron";
import { checkFullDiskAccess } from "./full-disk-access";

export const PERMISSION_SETTINGS_URLS = {
	fullDiskAccess:
		"x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
	accessibility:
		"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
	microphone:
		"x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
	appleEvents:
		"x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Automation",
	localNetwork:
		"x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_LocalNetwork",
} as const;

type ShellApi = Pick<typeof electronShell, "openExternal">;
type SystemPreferencesApi = Pick<
	typeof electronSystemPreferences,
	"askForMediaAccess" | "getMediaAccessStatus" | "isTrustedAccessibilityClient"
>;

function getElectronShell(): ShellApi {
	return (require("electron") as Partial<typeof import("electron")>)
		.shell as ShellApi;
}

function getElectronSystemPreferences(): SystemPreferencesApi | undefined {
	return (require("electron") as Partial<typeof import("electron")>)
		.systemPreferences;
}

export function checkAccessibility({
	systemPreferencesApi = getElectronSystemPreferences(),
}: {
	systemPreferencesApi?: Pick<
		SystemPreferencesApi,
		"isTrustedAccessibilityClient"
	>;
} = {}): boolean {
	return systemPreferencesApi?.isTrustedAccessibilityClient(false) ?? false;
}

export function checkMicrophone({
	systemPreferencesApi = getElectronSystemPreferences(),
}: {
	systemPreferencesApi?: Pick<SystemPreferencesApi, "getMediaAccessStatus">;
} = {}): boolean {
	try {
		return (
			systemPreferencesApi?.getMediaAccessStatus("microphone") === "granted"
		);
	} catch {
		return false;
	}
}

export function getPermissionStatus() {
	return {
		fullDiskAccess: checkFullDiskAccess(),
		accessibility: checkAccessibility(),
		microphone: checkMicrophone(),
	};
}

export async function requestFullDiskAccess({
	shellApi = getElectronShell(),
}: {
	shellApi?: ShellApi;
} = {}): Promise<void> {
	await shellApi.openExternal(PERMISSION_SETTINGS_URLS.fullDiskAccess);
}

export async function requestAccessibility({
	shellApi = getElectronShell(),
}: {
	shellApi?: ShellApi;
} = {}): Promise<void> {
	await shellApi.openExternal(PERMISSION_SETTINGS_URLS.accessibility);
}

export async function requestMicrophone({
	shellApi = getElectronShell(),
	systemPreferencesApi,
}: {
	shellApi?: ShellApi;
	systemPreferencesApi?: Pick<SystemPreferencesApi, "askForMediaAccess">;
} = {}): Promise<{ granted: boolean }> {
	try {
		if (process.platform === "darwin") {
			const preferencesApi =
				systemPreferencesApi ?? getElectronSystemPreferences();
			const granted = await preferencesApi?.askForMediaAccess("microphone");
			if (granted) {
				return { granted: true };
			}
		}
	} catch {
		// Fall through to opening System Settings.
	}

	await shellApi.openExternal(PERMISSION_SETTINGS_URLS.microphone);
	return { granted: false };
}

export async function requestAppleEvents({
	shellApi = getElectronShell(),
}: {
	shellApi?: ShellApi;
} = {}): Promise<void> {
	await shellApi.openExternal(PERMISSION_SETTINGS_URLS.appleEvents);
}

export async function requestLocalNetwork({
	shellApi = getElectronShell(),
}: {
	shellApi?: ShellApi;
} = {}): Promise<void> {
	await shellApi.openExternal(PERMISSION_SETTINGS_URLS.localNetwork);
}
