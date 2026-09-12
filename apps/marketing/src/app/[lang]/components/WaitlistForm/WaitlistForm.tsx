"use client";

import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { withPosthog } from "@/lib/analytics/lazy";

interface WaitlistFormProps {
	heading?: string;
	description?: string;
}

export function WaitlistForm({ heading, description }: WaitlistFormProps) {
	const [email, setEmail] = useState("");
	const [submitted, setSubmitted] = useState(false);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!email) return;

		withPosthog((posthog) => {
			const wasOptedOut = posthog.has_opted_out_capturing();
			if (wasOptedOut) {
				posthog.opt_in_capturing();
			}

			track("waitlist_signup", { email, platform: "windows_linux" });

			if (wasOptedOut) {
				posthog.opt_out_capturing();
			}
		});

		setSubmitted(true);
	}

	if (submitted) {
		return (
			<div>
				<h2 className="mb-2 text-xl font-medium text-foreground">
					<Trans>You're on the list!</Trans>
				</h2>
				<p className="text-sm text-muted-foreground">
					<Trans>
						We'll notify you when Windows &amp; Linux support is ready.
					</Trans>
				</p>
			</div>
		);
	}

	return (
		<>
			{heading && (
				<h2 className="mb-2 text-xl font-medium text-foreground">{heading}</h2>
			)}
			{description && (
				<p className="mb-6 text-sm text-muted-foreground">{description}</p>
			)}
			<form onSubmit={handleSubmit} className="flex flex-col gap-3">
				<input
					type="email"
					required
					placeholder="you@example.com"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				/>
				<button
					type="submit"
					className="w-full rounded-lg bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
				>
					<Trans>Join waitlist</Trans>
				</button>
			</form>
		</>
	);
}
