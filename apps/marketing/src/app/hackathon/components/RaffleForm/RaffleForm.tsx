"use client";

import { DOWNLOAD_URL_MAC_ARM64 } from "@superset/shared/constants";
import posthog from "posthog-js";
import { type FormEvent, useState } from "react";
import { HiMiniArrowDownTray } from "react-icons/hi2";

export function RaffleForm() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [submitted, setSubmitted] = useState(false);

	function handleSubmit(e: FormEvent) {
		e.preventDefault();

		posthog.group("raffle", "hackathon-raffle", {
			name: "Hackathon Raffle",
		});

		posthog.capture("hackathon_raffle_entry", {
			$groups: { raffle: "hackathon-raffle" },
		});

		posthog.identify(email, {
			name,
			email,
			hackathon_raffle: true,
		});

		setSubmitted(true);
	}

	if (submitted) {
		return (
			<div className="border border-border">
				<div className="flex flex-col items-center justify-center py-12 sm:py-16 px-6">
					<svg
						width="48"
						height="48"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						className="text-foreground mb-4"
					>
						<title>Check</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<p className="text-lg font-medium text-foreground mb-2">
						You&apos;re in the raffle!
					</p>
					<p className="text-sm text-muted-foreground text-center max-w-md">
						Thanks {name}. We&apos;ve got your entry. Download Superset below to
						get started.
					</p>
				</div>

				<a
					href={DOWNLOAD_URL_MAC_ARM64}
					onClick={() => posthog.capture("hackathon_download_clicked")}
					className="flex items-center justify-center gap-2 py-4 border-t border-border text-sm font-medium tracking-wider text-background bg-foreground hover:bg-foreground/80 transition-colors"
				>
					DOWNLOAD SUPERSET
					<HiMiniArrowDownTray className="size-4" />
				</a>
			</div>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="border border-border">
			<div className="flex flex-col gap-4 p-6 sm:p-8">
				<div className="flex flex-col gap-2">
					<label
						htmlFor="name"
						className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
					>
						Name
					</label>
					<input
						id="name"
						type="text"
						required
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Your name"
						className="bg-background border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label
						htmlFor="email"
						className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
					>
						Email
					</label>
					<input
						id="email"
						type="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="you@example.com"
						className="bg-background border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
					/>
				</div>
			</div>

			<button
				type="submit"
				className="w-full flex items-center justify-center gap-2 py-4 border-t border-border text-sm font-medium tracking-wider text-background bg-foreground hover:bg-foreground/80 transition-colors"
			>
				ENTER RAFFLE
			</button>
		</form>
	);
}
