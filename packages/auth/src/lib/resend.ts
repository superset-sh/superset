import { isStrictProfile } from "@superset/shared/deployment-profile";
import { Resend } from "resend";

import { env } from "../env";

let client: Resend | null = null;

function getResend(): Resend {
	if (client) return client;
	if (!env.RESEND_API_KEY) {
		throw new Error(
			"Resend not configured — set RESEND_API_KEY (or use Mailpit/console for local dev)",
		);
	}
	client = new Resend(env.RESEND_API_KEY);
	return client;
}

interface CapturedEmail {
	to: unknown;
	subject?: unknown;
}

function logConsoleSend(arg: unknown) {
	if (Array.isArray(arg)) {
		for (const e of arg as CapturedEmail[]) {
			console.log(
				`[email:console] to=${String(e.to)} subject=${String(e.subject ?? "(no subject)")}`,
			);
		}
	} else if (arg && typeof arg === "object") {
		const e = arg as CapturedEmail;
		console.log(
			`[email:console] to=${String(e.to)} subject=${String(e.subject ?? "(no subject)")}`,
		);
	}
	return Promise.resolve({ data: { id: "console-dev" }, error: null });
}

// Lazy proxy over the full Resend surface. Throws only when actually used
// without a key — except `emails.send` and `batch.send`, which fall back to
// logging to stdout in lenient profiles so Better Auth's local signup flows work.
export const resend = new Proxy({} as Resend, {
	get(_t, prop) {
		if (!env.RESEND_API_KEY) {
			const allowConsoleFallback = !isStrictProfile();
			if (allowConsoleFallback && prop === "emails") {
				return { send: (arg: unknown) => logConsoleSend(arg) };
			}
			if (allowConsoleFallback && prop === "batch") {
				return { send: (arg: unknown) => logConsoleSend(arg) };
			}
			throw new Error(
				`Resend not configured — set RESEND_API_KEY (accessed property: ${String(prop)})`,
			);
		}
		return Reflect.get(getResend(), prop);
	},
});
