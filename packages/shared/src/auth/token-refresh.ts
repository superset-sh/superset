const CLIENT_ID = "superset-cli";

export interface LoginResult {
	accessToken: string;
	refreshToken?: string;
	expiresAt: number;
}

class CLIError extends Error {
	constructor(
		message: string,
		readonly suggestion?: string,
	) {
		super(message);
		this.name = "CLIError";
	}
}

function getApiUrl(): string {
	return process.env.SUPERSET_API_URL || "https://api.superset.sh";
}

export async function refreshAccessToken(
	refreshToken: string,
): Promise<LoginResult> {
	const apiUrl = getApiUrl();
	const response = await fetch(`${apiUrl}/api/auth/oauth2/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: CLIENT_ID,
			resource: apiUrl,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new CLIError(
			`Token refresh failed: ${response.status}`,
			body || "Run `superset auth login` again.",
		);
	}

	const data = (await response.json()) as {
		access_token: string;
		token_type: string;
		expires_in?: number;
		refresh_token?: string;
	};

	const expiresIn = data.expires_in ?? 60 * 60;
	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token ?? refreshToken,
		expiresAt: Date.now() + expiresIn * 1000,
	};
}
