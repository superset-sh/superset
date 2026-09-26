export const GOOGLE_SCOPES = [
	"openid",
	"email",
	"https://www.googleapis.com/auth/gmail.readonly",
] as const;

export const REFRESH_BUFFER_MS = 5 * 60 * 1000;
export const REFRESH_TOKEN_TIMEOUT_MS = 10 * 1000;
export const GOOGLE_API_TIMEOUT_MS = 20 * 1000;

/** Gmail's watch is capped at seven days. */
export const GMAIL_WATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Renew anything that would expire within this window on the next cron. */
export const WATCH_RENEW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
