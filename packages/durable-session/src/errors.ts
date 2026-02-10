const FRIENDLY_MESSAGES: Record<number, string> = {
	401: "Your session has expired. Please sign in again.",
	403: "You don't have permission to access this chat.",
	404: "Chat session not found. It may have been deleted.",
	429: "Too many requests. Please wait a moment and try again.",
	500: "Something went wrong on our end. Please try again.",
	502: "Chat server is temporarily unavailable. Please try again.",
	503: "Chat server is temporarily unavailable. Please try again.",
};

const NETWORK_MESSAGE =
	"Unable to connect to the chat server. Check your internet connection.";

export class StreamError extends Error {
	readonly status: number;
	readonly friendlyMessage: string;

	constructor(status: number, detail?: string) {
		const friendly =
			FRIENDLY_MESSAGES[status] ?? `Unexpected error (${status})`;
		super(detail ?? friendly);
		this.name = "StreamError";
		this.status = status;
		this.friendlyMessage = friendly;
	}

	static fromResponse(response: Response): StreamError {
		return new StreamError(response.status);
	}

	static friendly(error: unknown): { message: string; code: string | null } {
		if (error instanceof StreamError) {
			return {
				message: error.friendlyMessage,
				code: error.status > 0 ? `HTTP ${error.status}` : "NETWORK_ERROR",
			};
		}
		if (error instanceof TypeError && error.message.includes("fetch")) {
			return { message: NETWORK_MESSAGE, code: "NETWORK_ERROR" };
		}
		if (error instanceof Error) {
			if (error.message.includes("Content Security Policy")) {
				return {
					message:
						"Connection blocked by security policy. The chat server URL may not be allowed.",
					code: "CSP_VIOLATION",
				};
			}
			return { message: error.message, code: null };
		}
		return { message: "An unexpected error occurred.", code: "UNKNOWN" };
	}
}
