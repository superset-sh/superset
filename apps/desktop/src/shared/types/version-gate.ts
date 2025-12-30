export interface VersionGateStatus {
	currentVersion: string;
	minimumSupportedVersion: string | null;
	isUpdateRequired: boolean;
	autoUpdateSupported: boolean;
	configFetchError?: string;
}
