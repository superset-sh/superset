"use client";

import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuCheck, LuKey, LuMail, LuShieldCheck, LuUser } from "react-icons/lu";

interface ConsentFormProps {
	consentCode: string;
	clientId: string;
	scopes: string[];
	userName: string;
}

const SCOPE_DESCRIPTIONS: Record<
	string,
	{ label: string; icon: React.ReactNode }
> = {
	openid: {
		label: "Verify your identity",
		icon: <LuShieldCheck className="size-4" />,
	},
	profile: {
		label: "Access your profile information (name, picture)",
		icon: <LuUser className="size-4" />,
	},
	email: {
		label: "Access your email address",
		icon: <LuMail className="size-4" />,
	},
	offline_access: {
		label: "Stay connected (refresh tokens)",
		icon: <LuKey className="size-4" />,
	},
};

export function ConsentForm({
	consentCode,
	clientId,
	scopes,
	userName,
}: ConsentFormProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleConsent = async (accept: boolean) => {
		setIsLoading(true);
		setError(null);

		try {
			// Call the Better Auth consent endpoint
			const response = await fetch(
				`${process.env.NEXT_PUBLIC_API_URL}/api/auth/oauth2/consent`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					body: JSON.stringify({
						accept,
						consentCode,
					}),
				},
			);

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || "Failed to process consent");
			}

			const data = await response.json();

			// Redirect to the client's redirect URI with the authorization code
			if (data.redirectTo) {
				window.location.href = data.redirectTo;
			}
		} catch (err) {
			console.error("Consent error:", err);
			setError(err instanceof Error ? err.message : "An error occurred");
			setIsLoading(false);
		}
	};

	// Get client display name (for now, just use the client ID)
	const clientName = getClientDisplayName(clientId);

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					Authorize {clientName}
				</h1>
				<p className="text-muted-foreground text-sm">
					<span className="font-medium text-foreground">{clientName}</span> is
					requesting access to your Superset account
				</p>
			</div>

			<div className="bg-muted/50 rounded-lg border p-4">
				<p className="text-muted-foreground mb-3 text-sm">
					Signed in as{" "}
					<span className="font-medium text-foreground">{userName}</span>
				</p>
				<p className="mb-2 text-sm font-medium">
					This application will be able to:
				</p>
				<ul className="space-y-2">
					{scopes.map((scope) => {
						const scopeInfo = SCOPE_DESCRIPTIONS[scope];
						return (
							<li key={scope} className="flex items-center gap-2 text-sm">
								<span className="text-muted-foreground">
									{scopeInfo?.icon ?? <LuCheck className="size-4" />}
								</span>
								<span>{scopeInfo?.label ?? scope}</span>
							</li>
						);
					})}
				</ul>
			</div>

			{error && <p className="text-destructive text-center text-sm">{error}</p>}

			<div className="flex gap-3">
				<Button
					variant="outline"
					className="flex-1"
					disabled={isLoading}
					onClick={() => handleConsent(false)}
				>
					Deny
				</Button>
				<Button
					className="flex-1"
					disabled={isLoading}
					onClick={() => handleConsent(true)}
				>
					{isLoading ? "Authorizing..." : "Authorize"}
				</Button>
			</div>

			<p className="text-muted-foreground px-8 text-center text-xs">
				By authorizing, you allow this application to access your data according
				to its terms of service and privacy policy.
			</p>
		</div>
	);
}

function getClientDisplayName(clientId: string): string {
	const knownClients: Record<string, string> = {
		"claude-code": "Claude Code",
		"superset-desktop": "Superset Desktop",
	};
	return knownClients[clientId] ?? clientId;
}
