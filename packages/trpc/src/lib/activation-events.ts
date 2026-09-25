import { Resend } from "resend";
import { env } from "../env";

const resend = new Resend(env.RESEND_API_KEY);
const EVENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// `app.first_opened` lets the Resend activation automation branch
// installed-but-no-workspace users away from the download nudge. Guarded to
// recent signups so old accounts don't feed the automation; failures must
// never fail the calling mutation.
export async function emitAppFirstOpened(
	user: { email: string; createdAt: Date },
	userId: string,
	source: string,
) {
	try {
		if (Date.now() - user.createdAt.getTime() >= EVENT_WINDOW_MS) return;
		const { error } = await resend.events.send({
			event: "app.first_opened",
			email: user.email,
			payload: { userId },
		});
		if (error) throw new Error(error.message);
	} catch (error) {
		console.error(
			`[${source}] Failed to emit first-open event for ${userId}:`,
			error,
		);
	}
}
