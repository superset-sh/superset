"use client";

import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";

interface ReminderModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function ReminderModal({ isOpen, onClose }: ReminderModalProps) {
	const [email, setEmail] = useState("");
	const [submitted, setSubmitted] = useState(false);

	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "unset";
		}

		return () => {
			document.body.style.overflow = "unset";
		};
	}, [isOpen]);

	if (!isOpen) return null;

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!email) return;

		const wasOptedOut = posthog.has_opted_out_capturing();
		if (wasOptedOut) {
			posthog.opt_in_capturing();
		}

		track("mobile_hero_reminder_signup", { email, variant: "test" });

		if (wasOptedOut) {
			posthog.opt_out_capturing();
		}

		setSubmitted(true);
	}

	return (
		<>
			<button
				type="button"
				className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 cursor-default"
				onClick={onClose}
				aria-label="Close modal backdrop"
			/>

			<div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
				<div className="pointer-events-auto w-full max-w-md mx-4 bg-background rounded-2xl shadow-2xl border border-border overflow-hidden p-8 relative">
					<button
						type="button"
						onClick={onClose}
						className="absolute top-4 right-4 z-10 text-muted-foreground hover:text-foreground transition-colors"
						aria-label="Close modal"
					>
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>

					{submitted ? (
						<div>
							<h2 className="mb-2 text-xl font-medium text-foreground">
								Reminder set!
							</h2>
							<p className="text-sm text-muted-foreground">
								We'll email you a link so you can check out Superset from your
								desktop.
							</p>
						</div>
					) : (
						<>
							<h2 className="mb-2 text-xl font-medium text-foreground">
								Remind me on desktop
							</h2>
							<p className="mb-6 text-sm text-muted-foreground">
								Superset is a desktop app. Leave your email and we'll send you a
								link to check it out when you're back at your computer.
							</p>
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
									Send me a reminder
								</button>
							</form>
						</>
					)}
				</div>
			</div>
		</>
	);
}
