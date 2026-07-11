import hostServicePackageJson from "@superset/host-service/package.json" with {
	type: "json",
};
import { compareHostVersions } from "@superset/shared/host-version";

export { isInstallableHostVersion as isInstallableUpdateVersion } from "@superset/shared/host-version";

export const HOST_SERVICE_VERSION: string = hostServicePackageJson.version;

export function classifyUpdateTarget(
	currentVersion: string,
	targetVersion: string,
): "satisfied" | "upgrade" | "downgrade" {
	const order = compareHostVersions(targetVersion, currentVersion);
	if (order === null) return "downgrade";
	if (order === 0) return "satisfied";
	return order < 0 ? "downgrade" : "upgrade";
}
