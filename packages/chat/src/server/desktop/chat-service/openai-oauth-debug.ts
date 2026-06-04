const OPENAI_EXPECTED_CALLBACK_ORIGIN = "http://localhost:1455";
const OPENAI_EXPECTED_CALLBACK_PATH = "/auth/callback";

export function parseOpenAIOAuthUrl(url: string): Record<string, unknown> {
	try {
		const parsed = new URL(url);
		const redirectUriRaw = parsed.searchParams.get("redirect_uri");
		const redirectUri = redirectUriRaw ? new URL(redirectUriRaw) : null;
		const callbackTarget = redirectUri
			? `${redirectUri.origin}${redirectUri.pathname}`
			: null;

		return {
			authOrigin: parsed.origin,
			authPathname: parsed.pathname,
			hasStateParam: parsed.searchParams.has("state"),
			hasCodeChallengeParam: parsed.searchParams.has("code_challenge"),
			redirectUriOrigin: redirectUri?.origin ?? null,
			redirectUriPathname: redirectUri?.pathname ?? null,
			redirectUriMatchesExpected: callbackTarget
				? callbackTarget ===
					`${OPENAI_EXPECTED_CALLBACK_ORIGIN}${OPENAI_EXPECTED_CALLBACK_PATH}`
				: null,
		};
	} catch {
		return {
			authUrlParseError: true,
		};
	}
}

export function summarizeOpenAIManualInput(
	input: string,
): Record<string, unknown> {
	if (/^https?:\/\//i.test(input)) {
		try {
			const parsed = new URL(input);
			return {
				manualInputKind: "callback_url",
				manualInputOrigin: parsed.origin,
				manualInputPathname: parsed.pathname,
				manualInputHasCodeParam: parsed.searchParams.has("code"),
				manualInputHasStateParam: parsed.searchParams.has("state"),
			};
		} catch {
			return {
				manualInputKind: "malformed_url",
			};
		}
	}

	return {
		manualInputKind: "code_or_code_state",
		manualInputHasStateDelimiter: input.includes("#"),
		manualInputLength: input.length,
	};
}
