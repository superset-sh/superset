import { PROTOCOL_SCHEMES } from "@superset/shared/constants";

/**
 * The desktop registers `superset` (release), `superset-dev`, or
 * `superset-<workspace>` for a dev instance. Anything else is not a scheme
 * the app answers, and since the success page pastes this straight into
 * `${protocol}://auth/callback?token=...`, an unconstrained value would turn
 * the freshly minted session token into an open redirect.
 */
const DESKTOP_PROTOCOL = new RegExp(
	`^${PROTOCOL_SCHEMES.PROD}(?:-[a-z0-9][a-z0-9-]*)?$`,
	"i",
);

export function isDesktopProtocol(protocol: string): boolean {
	return DESKTOP_PROTOCOL.test(protocol);
}
