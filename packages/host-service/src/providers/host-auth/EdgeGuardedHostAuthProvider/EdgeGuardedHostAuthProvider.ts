import type { HostAuthProvider } from "../types";

/**
 * Accepts every request, because in a cloud workspace something else has
 * already turned the unauthorized ones away.
 *
 * A sandbox's host-service sits behind a private provider preview: the edge
 * rejects anything without a preview token, and only our API can mint one.
 * The obvious-looking alternative — keep the PSK here too — was a shared
 * secret baked into every sandbox, and every sandbox hands an agent a shell
 * that can read its own env. A second factor each tenant can read is not a
 * second factor; it just makes the posture look deeper than it is.
 *
 * So the posture is stated rather than dressed up: one gate, at the edge, and
 * a sandbox whose preview is ever made public is open. That is the thing to
 * watch when changing preview configuration.
 */
export class EdgeGuardedHostAuthProvider implements HostAuthProvider {
	validate(): boolean {
		return true;
	}

	validateToken(): boolean {
		return true;
	}
}
