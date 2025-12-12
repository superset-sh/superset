"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import { COMPANY, DOWNLOAD_URL_MAC_ARM64 } from "@superset/shared/constants";
import { getInitials } from "@superset/shared/names";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Download, LogOut } from "lucide-react";
import Image from "next/image";
import { FaGithub } from "react-icons/fa";

import { env } from "@/env";

export default function HomePage() {
	const { user } = useUser();

	const initials = getInitials(
		user?.fullName,
		user?.primaryEmailAddress?.emailAddress,
	);

	return (
		<div className="relative flex min-h-screen flex-col">
			<header className="container mx-auto flex items-center justify-between px-6 py-6">
				<a href="/">
					<Image
						src="/title.svg"
						alt="Superset"
						width={140}
						height={24}
						priority
					/>
				</a>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-1.5 shadow-xs outline-none transition-all hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
						>
							{user?.firstName && (
								<span className="text-sm">Hello, {user.firstName}!</span>
							)}
							<Avatar className="size-7">
								<AvatarImage src={user?.imageUrl} alt={user?.fullName ?? ""} />
								<AvatarFallback className="text-xs">{initials}</AvatarFallback>
							</Avatar>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuLabel className="font-normal">
							<div className="flex flex-col space-y-1">
								{user?.fullName && (
									<p className="text-sm font-medium">{user.fullName}</p>
								)}
								<p className="text-muted-foreground text-xs">
									{user?.primaryEmailAddress?.emailAddress}
								</p>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<SignOutButton>
							<DropdownMenuItem className="cursor-pointer">
								<LogOut className="mr-2 size-4" />
								Sign out
							</DropdownMenuItem>
						</SignOutButton>
					</DropdownMenuContent>
				</DropdownMenu>
			</header>

			<main className="container mx-auto flex flex-1 flex-col items-center justify-center px-6 py-12">
				<div className="mx-auto max-w-2xl space-y-8 text-center">
					<h1 className="font-mono text-3xl font-normal leading-tight tracking-tight md:text-4xl">
						Download the app to get started
					</h1>

					<p className="text-muted-foreground mx-auto max-w-md text-lg">
						Superset runs locally on your machine. Download the desktop app to
						start running parallel coding agents.
					</p>

					<div className="flex flex-wrap items-center justify-center gap-4">
						<Button size="lg" className="gap-2" asChild>
							<a href={DOWNLOAD_URL_MAC_ARM64}>
								Download for macOS
								<Download className="h-4 w-4" aria-hidden="true" />
							</a>
						</Button>
						<Button variant="outline" size="lg" className="gap-2" asChild>
							<a
								href={COMPANY.GITHUB_URL}
								target="_blank"
								rel="noopener noreferrer"
							>
								<FaGithub className="size-4" aria-hidden="true" />
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
