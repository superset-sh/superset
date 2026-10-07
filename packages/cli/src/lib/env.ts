import { msg } from "@lingui/core/macro";
import { i18n, initI18n } from "@superset/i18n";

if (!i18n.locale) initI18n();

declare const __SUPERSET_CLI_ORIGIN_DEFAULTS__: {
	api?: string;
	web?: string;
	relay?: string;
	realtime?: string;
};

const defaults =
	typeof __SUPERSET_CLI_ORIGIN_DEFAULTS__ === "undefined"
		? undefined
		: __SUPERSET_CLI_ORIGIN_DEFAULTS__;
const UPSTREAM_API_URL = "https://api.superset.sh";
const UPSTREAM_UPDATE_BASE =
	"https://github.com/superset-sh/superset/releases/download";

export const env = {
	RELAY_URL:
		process.env.RELAY_URL || defaults?.relay || "https://relay.superset.sh",
	SUPERSET_API_URL:
		process.env.SUPERSET_API_URL || defaults?.api || UPSTREAM_API_URL,
	SUPERSET_WEB_URL:
		process.env.SUPERSET_WEB_URL || defaults?.web || "https://app.superset.sh",
	REALTIME_URL:
		process.env.REALTIME_URL ||
		defaults?.realtime ||
		"https://realtime.superset.sh",
	VERSION: process.env.SUPERSET_VERSION || "0.0.0-dev",
	CLI_UPDATE_BASE_URL: process.env.CLI_UPDATE_BASE_URL || UPSTREAM_UPDATE_BASE,
};

export function mixedOriginUpdateError(): string | null {
	const upstreamApi =
		env.SUPERSET_API_URL.replace(/\/$/, "") === UPSTREAM_API_URL;
	const upstreamFeed =
		env.CLI_UPDATE_BASE_URL.replace(/\/$/, "") === UPSTREAM_UPDATE_BASE;
	if (upstreamApi === upstreamFeed) return null;
	return i18n._(
		msg({
			message:
				"Refusing to update: this CLI's API and update channel point at different deployments. Rebuild with CLI_UPDATE_BASE_URL set to the matching channel.",
		}),
	);
}

export function standaloneInstallHint(): string {
	if (
		env.SUPERSET_API_URL.replace(/\/$/, "") === UPSTREAM_API_URL &&
		env.CLI_UPDATE_BASE_URL.replace(/\/$/, "") === UPSTREAM_UPDATE_BASE
	)
		return i18n._(
			msg({
				message:
					"For a standalone CLI that updates in place: curl -fsSL https://superset.sh/cli/install.sh | sh",
			}),
		);
	if (env.CLI_UPDATE_BASE_URL.replace(/\/$/, "") !== UPSTREAM_UPDATE_BASE) {
		const channel = `${env.CLI_UPDATE_BASE_URL.replace(/\/$/, "")}/cli-latest/`;
		return i18n._(
			msg({
				message: `For a standalone CLI that updates in place, install from this deployment's channel: ${channel}`,
			}),
		);
	}
	return i18n._(
		msg({
			message:
				"For a standalone CLI, rebuild from this repository with CLI_UPDATE_BASE_URL set to this deployment's channel.",
		}),
	);
}

/**
 * True for the CLI compiled into the desktop app bundle (baked at build time
 * by apps/desktop/scripts/build-bundled-cli.ts). The bundled CLI ships without
 * superset-host and lives inside the signed .app, so it can neither run the
 * host service standalone nor update itself in place.
 */
export function isDesktopBundled(): boolean {
	return process.env.SUPERSET_CLI_CHANNEL === "desktop-bundled";
}
