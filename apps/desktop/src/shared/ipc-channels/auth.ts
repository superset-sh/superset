/**
 * Authentication IPC channels for Auth0 integration
 * Uses PKCE flow with system browser for secure auth
 */

export interface AuthSession {
	userId: string;
	sessionId: string;
	email: string | null;
	firstName: string | null;
	lastName: string | null;
	imageUrl: string | null;
	expiresAt: number;
	accessToken?: string;
}

export interface AuthChannels {
	"auth:get-session": {
		request: undefined;
		response: AuthSession | null;
	};

	"auth:start-sign-in": {
		request: undefined;
		response: { success: boolean; error?: string };
	};

	"auth:start-sign-up": {
		request: undefined;
		response: { success: boolean; error?: string };
	};

	"auth:sign-out": {
		request: undefined;
		response: { success: boolean; error?: string };
	};

	"auth:refresh-session": {
		request: undefined;
		response: AuthSession | null;
	};

	"auth:session-changed": {
		request: undefined;
		response: AuthSession | null;
	};
}
