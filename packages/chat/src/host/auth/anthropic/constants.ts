export const ANTHROPIC_OAUTH_TOKEN_URL =
	"https://console.anthropic.com/v1/oauth/token";

export const ANTHROPIC_OAUTH_CLIENT_ID = Buffer.from(
	"OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl",
	"base64",
).toString("utf8");

export const REFRESH_BUFFER_MS = 5 * 60 * 1000;
export const REFRESH_REQUEST_TIMEOUT_MS = 30_000;
