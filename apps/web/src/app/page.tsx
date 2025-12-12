"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import { Button } from "@superset/ui/button";
import { Download } from "lucide-react";
import { FaGithub } from "react-icons/fa";
import Image from "next/image";

import { env } from "@/env";

export default function HomePage() {
	const { user } = useUser();

	return (
		<div className="relative flex min-h-screen flex-col">
			<header className="container mx-auto flex items-center justify-between px-6 py-6">
				<Image
					src="/title.svg"
					alt="Superset"
					width={140}
					height={24}
					priority
				/>
				<div className="flex items-center gap-4">
					{user && (
						<span className="text-muted-foreground hidden text-sm sm:block">
							{user.primaryEmailAddress?.emailAddress}
						</span>
					)}
					<SignOutButton>
						<Button variant="outline" size="sm">
							Sign Out
						</Button>
					</SignOutButton>
				</div>
			</header>

			<main className="container mx-auto flex flex-1 flex-col items-center justify-center px-6 py-12">
				<div className="mx-auto max-w-2xl space-y-8 text-center">
					{user?.firstName && (
						<p className="text-muted-foreground text-lg">
							Welcome back, {user.firstName}
						</p>
					)}

					<h1 className="font-mono text-3xl font-normal leading-tight tracking-tight md:text-4xl">
						Download the app to get started
					</h1>

					<p className="text-muted-foreground mx-auto max-w-md text-lg">
						Superset runs locally on your machine. Download the desktop app to
						start running parallel coding agents.
					</p>

					<div className="flex flex-wrap items-center justify-center gap-4">
						<Button size="lg" className="gap-2">
							Download for macOS
							<Download className="h-4 w-4" />
						</Button>
						<Button variant="outline" size="lg" className="gap-2" asChild>
							<a
								href="https://github.com/superset-sh/superset"
								target="_blank"
								rel="noopener noreferrer"
							>
								<FaGithub className="size-4" />
								View on GitHub
							</a>
						</Button>
					</div>
				</div>
			</main>

			{/* Footer */}
			<footer className="container mx-auto px-6 py-6">
				<div className="text-muted-foreground flex items-center justify-center gap-4 text-sm">
					<a
						href={`${env.NEXT_PUBLIC_MARKETING_URL}/terms`}
						className="hover:text-foreground transition-colors"
					>
						Terms
					</a>
					<span>·</span>
					<a
						href={`${env.NEXT_PUBLIC_MARKETING_URL}/privacy`}
						className="hover:text-foreground transition-colors"
					>
						Privacy
					</a>
				</div>
			</footer>
		</div>
	);
}
