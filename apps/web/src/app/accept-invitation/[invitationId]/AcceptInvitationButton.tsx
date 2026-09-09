"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useState } from "react";
import { env } from "@/env";

interface AcceptInvitationButtonProps {
	invitationId: string;
	token: string;
}

export function AcceptInvitationButton({
	invitationId,
	token,
}: AcceptInvitationButtonProps) {
	const { t } = useLingui();
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const getErrorMessage = async (response: Response) => {
		const text = await response.text();

		if (text) {
			try {
				const data = JSON.parse(text) as {
					error?: string;
					message?: string;
				};

				if (data.error) return data.error;
				if (data.message) return data.message;
			} catch {
				return text;
			}
		}

		if (response.status === 409) {
			return t({
				message: "This invitation has already been accepted.",
			});
		}

		if (response.status === 400 || response.status === 404) {
			return t({
				message: "This invitation link is invalid or has expired.",
			});
		}

		return t({
			message: "Failed to accept invitation",
		});
	};

	const handleContinue = async () => {
		setIsProcessing(true);
		setError(null);
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
				throw new Error(await getErrorMessage(response));
			}

			// Session cookie is now set by the server
			// Force a hard redirect to reload the session
			window.location.href = "/";
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: t({
							message: "Failed to accept invitation",
						}),
			);
			setIsProcessing(false);
		}
	};

	return (
		<>
			<Button onClick={handleContinue} size="lg" disabled={isProcessing}>
				{isProcessing ? (
					<Trans>Processing...</Trans>
				) : (
					<Trans>Accept invitation</Trans>
				)}
			</Button>

			{error && <p className="text-sm text-destructive">{error}</p>}
		</>
	);
}
