/** Reads the `exp` claim (as epoch ms) from a JWT without verifying it. */
export function decodeJwtExpiresAtMs(token: string): number | null {
	try {
		const payloadPart = token.split(".")[1];
		if (!payloadPart) return null;
		const payload = JSON.parse(
			atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/")),
		) as { exp?: unknown };
		return typeof payload.exp === "number" ? payload.exp * 1000 : null;
	} catch {
		return null;
	}
}
