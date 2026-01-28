"use client";

import { Button } from "@superset/ui/button";
import { useState } from "react";
import { env } from "@/env";

interface AcceptInvitationButtonProps {
	invitationId: string;
	token: string;
	email: string;
}

export function AcceptInvitationButton({
	invitationId,
	token,
	email,
}: AcceptInvitationButtonProps) {
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleContinue = async () => {
		setIsProcessing(true);
		try {
			// Call the Better Auth endpoint that handles auth and cookies properly
			const response = await fetch(
				`${env.NEXT_PUBLIC_API_URL}/api/auth/accept-invitation`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					body: JSON.stringify({
						invitationId,
						token,
					}),
				},
			);

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to accept invitation");
			}

			// Session cookie is now set by the server
			// Force a hard redirect to reload the session
			window.location.href = "/";
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to accept invitation",
			);
			setIsProcessing(false);
		}
	};

	return (
		<>
			<Button onClick={handleContinue} size="lg" disabled={isProcessing}>
				{isProcessing ? "Processing..." : `Continue as ${email}`}
			</Button>

			{error && <p className="text-sm text-destructive">{error}</p>}
		</>
	);
}
