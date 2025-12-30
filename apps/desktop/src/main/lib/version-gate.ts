import { app } from "electron";
import { env } from "main/env.main";
import { PLATFORM } from "shared/constants";
import type { VersionGateStatus } from "shared/types";
import { isSemverLt } from "shared/utils/semver";

const FETCH_TIMEOUT_MS = 3000;
const VERSION_CONFIG_URL = `${env.NEXT_PUBLIC_API_URL}/api/public/desktop/version`;

let cachedStatus: VersionGateStatus | null = null;

async function fetchMinimumSupportedVersion(): Promise<string | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		const response = await fetch(VERSION_CONFIG_URL, {
			signal: controller.signal,
			headers: {
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`Config request failed (${response.status})`);
		}

		const body = (await response.json()) as unknown;
		if (
			typeof body === "object" &&
			body !== null &&
			"minimumSupportedVersion" in body &&
			typeof body.minimumSupportedVersion === "string" &&
			body.minimumSupportedVersion.trim() !== ""
		) {
			return body.minimumSupportedVersion.trim();
		}

		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export async function getVersionGateStatus(
	options: { refresh?: boolean } = {},
): Promise<VersionGateStatus> {
	if (cachedStatus && !options.refresh) {
		return cachedStatus;
	}

	const currentVersion = app.getVersion();
	const autoUpdateSupported = env.NODE_ENV !== "development" && PLATFORM.IS_MAC;

	try {
		const minimumSupportedVersion = await fetchMinimumSupportedVersion();
		if (!minimumSupportedVersion) {
			cachedStatus = {
				currentVersion,
				minimumSupportedVersion: null,
				isUpdateRequired: false,
				autoUpdateSupported,
			};
			return cachedStatus;
		}

		const isLt = isSemverLt(currentVersion, minimumSupportedVersion);
		if (isLt === null) {
			console.warn(
				"[version-gate] Invalid semver in minimumSupportedVersion:",
				minimumSupportedVersion,
			);
			cachedStatus = {
				currentVersion,
				minimumSupportedVersion,
				isUpdateRequired: false,
				autoUpdateSupported,
				configFetchError: "Invalid semver in version gate config",
			};
			return cachedStatus;
		}

		cachedStatus = {
			currentVersion,
			minimumSupportedVersion,
			isUpdateRequired: isLt,
			autoUpdateSupported,
		};
		return cachedStatus;
	} catch (error) {
		console.warn("[version-gate] Failed to fetch version gate config:", error);
		cachedStatus = {
			currentVersion,
			minimumSupportedVersion: null,
			isUpdateRequired: false,
			autoUpdateSupported,
			configFetchError: error instanceof Error ? error.message : String(error),
		};
		return cachedStatus;
	}
}
