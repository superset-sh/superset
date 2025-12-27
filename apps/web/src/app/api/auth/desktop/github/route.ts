import { redirect } from "next/navigation";
import { env } from "@/env";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");
	const errorDescription = url.searchParams.get("error_description");

	if (error) {
		const errorUrl = new URL("/auth/desktop/success", env.NEXT_PUBLIC_WEB_URL);
		errorUrl.searchParams.set("error", errorDescription || error);
		redirect(errorUrl.toString());
	}

	if (!code || !state) {
		const errorUrl = new URL("/auth/desktop/success", env.NEXT_PUBLIC_WEB_URL);
		errorUrl.searchParams.set("error", "Missing authentication parameters");
		redirect(errorUrl.toString());
	}

	let tokenData: {
		accessToken: string;
		accessTokenExpiresAt: number;
		refreshToken: string;
		refreshTokenExpiresAt: number;
	} | null = null;
	let exchangeError: string | null = null;

	try {
		const response = await fetch(
			`${env.NEXT_PUBLIC_API_URL}/api/auth/desktop/github`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					code,
					redirectUri: `${env.NEXT_PUBLIC_WEB_URL}/api/auth/desktop/github`,
				}),
			},
		);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			exchangeError = errorData.error || "Failed to complete sign in";
		} else {
			tokenData = (await response.json()) as {
				accessToken: string;
				accessTokenExpiresAt: number;
				refreshToken: string;
				refreshTokenExpiresAt: number;
			};
		}
	} catch (err) {
		console.error("[api/auth/desktop/github] Error:", err);
		exchangeError = "An unexpected error occurred";
	}

	if (exchangeError || !tokenData) {
		const errorUrl = new URL("/auth/desktop/success", env.NEXT_PUBLIC_WEB_URL);
		errorUrl.searchParams.set("error", exchangeError || "Failed to sign in");
		redirect(errorUrl.toString());
	}

	const successUrl = new URL("/auth/desktop/success", env.NEXT_PUBLIC_WEB_URL);
	successUrl.searchParams.set("accessToken", tokenData.accessToken);
	successUrl.searchParams.set(
		"accessTokenExpiresAt",
		tokenData.accessTokenExpiresAt.toString(),
	);
	successUrl.searchParams.set("refreshToken", tokenData.refreshToken);
	successUrl.searchParams.set(
		"refreshTokenExpiresAt",
		tokenData.refreshTokenExpiresAt.toString(),
	);
	successUrl.searchParams.set("state", state);
	redirect(successUrl.toString());
}
