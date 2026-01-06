import { clerkClient } from "@clerk/nextjs/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "@/env";
import { generateTokens } from "../tokens";

/**
 * Google OAuth token response
 */
interface GoogleTokenResponse {
	access_token: string;
	expires_in: number;
	token_type: string;
	scope: string;
	id_token: string;
	refresh_token?: string;
}

/**
 * Google ID token payload (verified)
 */
interface GoogleIdTokenPayload {
	iss: string;
	azp: string;
	aud: string;
	sub: string;
	email: string;
	email_verified: boolean;
	name?: string;
	picture?: string;
	given_name?: string;
	family_name?: string;
	iat: number;
	exp: number;
}

// Google's JWKS endpoint - jose handles caching internally
const GOOGLE_JWKS = createRemoteJWKSet(
	new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

/**
 * Exchange Google auth code for tokens and create desktop session
 *
 * POST /api/auth/desktop/google
 * Body: { code: string, redirectUri: string }
 * Returns: { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt }
 */
export async function POST(request: Request) {
	try {
		const body = await request.json();
		const { code, redirectUri } = body as {
			code: string;
			redirectUri: string;
		};

		if (!code || !redirectUri) {
			return Response.json(
				{ error: "Missing code or redirectUri" },
				{ status: 400 },
			);
		}

		// Exchange code for tokens with Google
		const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				code,
				client_id: env.GOOGLE_CLIENT_ID,
				client_secret: env.GOOGLE_CLIENT_SECRET,
				redirect_uri: redirectUri,
				grant_type: "authorization_code",
			}),
		});

		if (!tokenResponse.ok) {
			const errorData = await tokenResponse.json().catch(() => ({}));
			console.error("[auth/google] Token exchange failed:", errorData);
			return Response.json(
				{ error: errorData.error_description || "Token exchange failed" },
				{ status: 400 },
			);
		}

		const googleTokens: GoogleTokenResponse = await tokenResponse.json();

		// Verify the ID token signature and claims using Google's JWKS
		let payload: GoogleIdTokenPayload;
		try {
			const { payload: verifiedPayload } = await jwtVerify(
				googleTokens.id_token,
				GOOGLE_JWKS,
				{
					issuer: ["https://accounts.google.com", "accounts.google.com"],
					audience: env.GOOGLE_CLIENT_ID,
				},
			);
			payload = verifiedPayload as unknown as GoogleIdTokenPayload;
		} catch (jwtError) {
			console.error("[auth/google] JWT verification failed:", jwtError);
			return Response.json(
				{ error: "Invalid or expired ID token" },
				{ status: 401 },
			);
		}

		if (!payload.email_verified) {
			return Response.json({ error: "Email not verified" }, { status: 400 });
		}

		// Find or create user in Clerk
		const clerk = await clerkClient();
		const existingUsers = await clerk.users.getUserList({
			emailAddress: [payload.email],
		});

		let userId: string;
		const existingUser = existingUsers.data[0];

		if (existingUser) {
			userId = existingUser.id;
			console.log("[auth/google] Found existing user:", userId);
		} else {
			// Create new user
			try {
				const newUser = await clerk.users.createUser({
					emailAddress: [payload.email],
					firstName: payload.given_name,
					lastName: payload.family_name,
					skipPasswordRequirement: true,
				});
				userId = newUser.id;
				console.log("[auth/google] Created new user:", userId);

				// Mark the email as verified since Google already verified it
				const emailId = newUser.emailAddresses[0]?.id;
				if (emailId) {
					await clerk.emailAddresses.updateEmailAddress(emailId, {
						verified: true,
					});
					console.log("[auth/google] Marked email as verified");
				}
			} catch (clerkError: unknown) {
				// Log and return detailed Clerk error
				const errorDetails =
					clerkError && typeof clerkError === "object" && "errors" in clerkError
						? (clerkError as { errors: unknown[] }).errors
						: clerkError;
				console.error(
					"[auth/google] Clerk createUser failed:",
					JSON.stringify(errorDetails, null, 2),
				);
				return Response.json(
					{
						error: "Failed to create user account",
						details: errorDetails,
					},
					{ status: 400 },
				);
			}
		}

		// Generate access and refresh tokens
		const tokens = await generateTokens(userId, payload.email);

		return Response.json(tokens);
	} catch (error) {
		console.error("[auth/google] Error:", error);
		return Response.json({ error: "Internal server error" }, { status: 500 });
	}
}
