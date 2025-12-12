"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import { Button } from "@superset/ui/button";
import Link from "next/link";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";

export default function HomePage() {
	const { user: clerkUser } = useUser();
	const trpc = useTRPC();
	const { data: dbUser, isLoading, error } = useQuery(trpc.user.me.queryOptions());

	return (
		<main className="container mx-auto py-8">
			<div className="mb-12 flex items-center justify-between">
				<div>
					<h1 className="text-4xl font-bold">Welcome to Superset</h1>
					<p className="text-muted-foreground mt-2">
						You&apos;re authenticated!
					</p>
				</div>
				<SignOutButton>
					<Button variant="outline">Sign Out</Button>
				</SignOutButton>
			</div>

			<div className="grid gap-8 md:grid-cols-2">
				{/* Clerk User Info */}
				<div className="rounded-lg border p-6">
					<h2 className="mb-4 text-xl font-semibold">Clerk Session</h2>
					{clerkUser ? (
						<dl className="space-y-2 text-sm">
							<div>
								<dt className="text-muted-foreground">Clerk ID</dt>
								<dd className="font-mono">{clerkUser.id}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Email</dt>
								<dd>{clerkUser.primaryEmailAddress?.emailAddress}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Name</dt>
								<dd>{clerkUser.fullName || "Not set"}</dd>
							</div>
						</dl>
					) : (
						<p className="text-muted-foreground">Loading Clerk user...</p>
					)}
				</div>

				{/* Database User Info (via tRPC) */}
				<div className="rounded-lg border p-6">
					<h2 className="mb-4 text-xl font-semibold">Database User (tRPC)</h2>
					{isLoading ? (
						<p className="text-muted-foreground">Loading from API...</p>
					) : error ? (
						<div className="text-red-500">
							<p className="font-medium">Error fetching user:</p>
							<p className="text-sm">{error.message}</p>
						</div>
					) : dbUser ? (
						<dl className="space-y-2 text-sm">
							<div>
								<dt className="text-muted-foreground">UUID</dt>
								<dd className="font-mono">{dbUser.id}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Email</dt>
								<dd>{dbUser.email}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Name</dt>
								<dd>{dbUser.name}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Clerk ID</dt>
								<dd className="font-mono">{dbUser.clerkId}</dd>
							</div>
						</dl>
					) : (
						<p className="text-muted-foreground">
							User not found in database (webhook may not have fired yet)
						</p>
					)}
				</div>
			</div>

			<div className="mt-12 flex flex-col items-center justify-center gap-4">
				<p className="text-muted-foreground text-lg">
					Auth is working. Ready to download the desktop app?
				</p>
				<Button asChild>
					<Link href="/download">Go to Download Page</Link>
				</Button>
			</div>
		</main>
	);
}
