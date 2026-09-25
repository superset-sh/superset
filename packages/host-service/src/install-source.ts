import hostServicePackageJson from "@superset/host-service/package.json" with {
	type: "json",
};
import {
	HOST_INSTALL_SOURCE_ENV,
	type HostInstallSource,
	parseHostInstallSource,
} from "@superset/shared/host-version";

/** The version of this host-service build, from its package.json. */
export const HOST_SERVICE_VERSION: string = hostServicePackageJson.version;

/**
 * Who spawned this process, as declared by the spawner through
 * SUPERSET_HOST_INSTALL_SOURCE. Decides whether the host can update itself
 * (standalone CLI install) or only through the app that embeds it (desktop).
 */
export function getHostInstallSource(): HostInstallSource {
	return parseHostInstallSource(process.env[HOST_INSTALL_SOURCE_ENV]);
}
