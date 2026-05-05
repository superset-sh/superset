import { createServer } from "node:http";

export const OPENAI_OAUTH_CALLBACK_HOST = "127.0.0.1";
export const OPENAI_OAUTH_CALLBACK_PORT = 1455;

export async function assertOpenAIOAuthCallbackPortAvailable(): Promise<void> {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.unref();
		probe.once("error", (error: NodeJS.ErrnoException) => {
			if (error.code === "EADDRINUSE") {
				reject(
					new Error(
						`OpenAI OAuth callback port ${OPENAI_OAUTH_CALLBACK_PORT} is already in use. ` +
							"Close any other OpenAI/Codex login flow (e.g. Codex CLI) and try again.",
					),
				);
				return;
			}
			reject(error);
		});
		probe.listen(OPENAI_OAUTH_CALLBACK_PORT, OPENAI_OAUTH_CALLBACK_HOST, () => {
			probe.close((closeError) => {
				if (closeError) {
					reject(closeError);
					return;
				}
				resolve();
			});
		});
	});
}
