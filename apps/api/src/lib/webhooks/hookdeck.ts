import { env } from "@/env";
import { hmacBase64, timingSafeBase64, unauthorized } from "./verify";

/**
 * What a delivery turned out to be.
 *
 * `absent` is not a failure: during a cutover the same route serves traffic
 * arriving straight from the provider and traffic arriving through Hookdeck,
 * and the caller falls back to the provider's own scheme. It is also what
 * makes rollback free — repointing the URL at the provider needs no deploy.
 */
export type HookdeckDelivery = "absent" | "verified" | Response;

/**
 * Verifies a delivery forwarded by Hookdeck.
 *
 * Two independent checks, and both are load-bearing. The signature proves
 * Hookdeck sent this. `x-hookdeck-verified` proves Hookdeck checked the
 * provider's own signature before forwarding — without it, a source whose
 * verification was never configured would hand us whatever anyone posted to
 * its URL, correctly signed by Hookdeck and indistinguishable from real
 * traffic.
 *
 * Nothing here is time-bound, which is the entire point. Linear signs a
 * timestamp and enforces a ±60s replay window, and Hookdeck replays the
 * original signature when it retries — so verifying Linear's signature behind
 * a queue would reject every retry, which is precisely the delivery the
 * gateway exists to save. Hookdeck's own signature is over the body alone and
 * survives any delay.
 */
export function verifyHookdeckDelivery(
	request: Request,
	rawBody: string,
): HookdeckDelivery {
	const signature = request.headers.get("x-hookdeck-signature");
	if (!signature) return "absent";

	const secret = env.HOOKDECK_SIGNING_SECRET;
	if (!secret) {
		// Signed by Hookdeck but nothing here can check it. Trusting it would
		// mean trusting the header's existence, which anyone can send.
		console.error(
			"[hookdeck] delivery arrived but HOOKDECK_SIGNING_SECRET is unset",
		);
		return unauthorized("Hookdeck signing secret not configured");
	}

	const expected = hmacBase64(rawBody, secret);
	// The second header only appears while a rolled secret is still in its
	// grace period; either matching is a genuine Hookdeck signature.
	const rotating = request.headers.get("x-hookdeck-signature-2");
	const signed =
		timingSafeBase64(signature, expected) ||
		(rotating !== null && timingSafeBase64(rotating, expected));
	if (!signed) return unauthorized("Invalid Hookdeck signature");

	if (request.headers.get("x-hookdeck-verified") !== "true") {
		// Hookdeck forwarded something it did not authenticate, which means the
		// source is missing its provider verification config.
		console.error(
			"[hookdeck] delivery was not verified at the source; check source auth",
		);
		return unauthorized("Delivery not verified at source");
	}

	return "verified";
}
