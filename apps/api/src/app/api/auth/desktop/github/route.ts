import { clerkClient } from "@clerk/nextjs/server";
import { env } from "@/env";
import { generateTokens } from "../tokens";

/**
 * GitHub OAuth token response
 */
interface GitHubTokenResponse {
	access_token: string;
	token_type: string;
	scope: string;
}

/**
 * GitHub user response
 */
interface GitHubUser {
	id: number;
	login: string;
	name: string | null;
	email: string | null;
	avatar_url: string;
}

/**
 * GitHub email response
 */
interface GitHubEmail {
	email: string;
	primary: boolean;
	verified: boolean;
	visibility: string | null;
}

/**
 * Exchange GitHub auth code for tokens and create desktop session
 *
 * POST /api/auth/desktop/github
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

		// Exchange code for access token with GitHub
		const tokenResponse = await fetch(
			"https://github.com/login/oauth/access_token",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify({
					client_id: env.GH_CLIENT_ID,
					client_secret: env.GH_CLIENT_SECRET,
					code,
					redirect_uri: redirectUri,
				}),
			},
		);

		if (!tokenResponse.ok) {
			const errorData = await tokenResponse.json().catch(() => ({}));
			console.error("[auth/github] Token exchange failed:", errorData);
			return Response.json({ error: "Token exchange failed" }, { status: 400 });
		}

		const tokenData: GitHubTokenResponse = await tokenResponse.json();

		if (!tokenData.access_token) {
			console.error("[auth/github] No access token in response:", tokenData);
			return Response.json(
				{ error: "No access token received" },
				{ status: 400 },
			);
		}

		// Fetch user info from GitHub
		const userResponse = await fetch("https://api.github.com/user", {
			headers: {
				Authorization: `Bearer ${tokenData.access_token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});

		if (!userResponse.ok) {
			console.error("[auth/github] Failed to fetch user info");
			return Response.json(
				{ error: "Failed to fetch user info" },
				{ status: 400 },
			);
		}

		const githubUser: GitHubUser = await userResponse.json();

		// Always fetch verified email from /user/emails endpoint
		// Never trust githubUser.email as it could be unverified
		const emailsResponse = await fetch("https://api.github.com/user/emails", {
			headers: {
				Authorization: `Bearer ${tokenData.access_token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});

		if (!emailsResponse.ok) {
			console.error("[auth/github] Failed to fetch user emails");
			return Response.json(
				{ error: "Failed to fetch user emails" },
				{ status: 400 },
			);
		}

		const emails: GitHubEmail[] = await emailsResponse.json();
		// Only trust verified emails - prefer primary+verified, fallback to any verified
		const primaryVerifiedEmail = emails.find((e) => e.primary && e.verified);
		const anyVerifiedEmail = emails.find((e) => e.verified);
		const email =
			primaryVerifiedEmail?.email || anyVerifiedEmail?.email || null;

		if (!email) {
			return Response.json(
				{ error: "No verified email found on GitHub account" },
				{ status: 400 },
			);
		}

		// Parse name into first/last
		const nameParts = (githubUser.name || "").split(" ");
		const firstName = nameParts[0] || undefined;
		const lastName = nameParts.slice(1).join(" ") || undefined;

		// Find or create user in Clerk
		const clerk = await clerkClient();
		const existingUsers = await clerk.users.getUserList({
			emailAddress: [email],
		});

		let userId: string;
		const existingUser = existingUsers.data[0];

		if (existingUser) {
			userId = existingUser.id;
			console.log("[auth/github] Found existing user:", userId);
		} else {
			// Create new user
			try {
				const newUser = await clerk.users.createUser({
					emailAddress: [email],
					firstName,
					lastName,
					skipPasswordRequirement: true,
				});
				userId = newUser.id;
				console.log("[auth/github] Created new user:", userId);

				// Mark the email as verified since GitHub already verified it
				const emailId = newUser.emailAddresses[0]?.id;
				if (emailId) {
					await clerk.emailAddresses.updateEmailAddress(emailId, {
						verified: true,
					});
					console.log("[auth/github] Marked email as verified");
				}
			} catch (clerkError: unknown) {
				// Log and return detailed Clerk error
				const errorDetails =
					clerkError && typeof clerkError === "object" && "errors" in clerkError
						? (clerkError as { errors: unknown[] }).errors
						: clerkError;
				console.error(
					"[auth/github] Clerk createUser failed:",
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
		const tokens = await generateTokens(userId, email);

		return Response.json(tokens);
	} catch (error) {
		console.error("[auth/github] Error:", error);
		return Response.json({ error: "Internal server error" }, { status: 500 });
	}
}
