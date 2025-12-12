"use client";

import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@superset/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { Download, Laptop, MonitorIcon, Zap } from "lucide-react";

export default function DownloadPage() {
	return (
		<div className="relative min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
			<div className="absolute top-4 right-4 z-10">
				<SignOutButton>
					<Button variant="outline" size="sm">
						Sign Out
					</Button>
				</SignOutButton>
			</div>

			<div className="container mx-auto flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
				<div className="mb-6 inline-flex rounded-full bg-blue-500/10 p-3">
					<Laptop className="h-8 w-8 text-blue-600 dark:text-blue-400" />
				</div>

				<h1 className="mb-6 text-4xl font-bold text-foreground sm:text-5xl">
					One More Step to{" "}
					<span className="bg-gradient-to-r from-blue-500 to-blue-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-blue-500">
						Get Started
					</span>
				</h1>

				<p className="mx-auto mb-12 max-w-lg text-xl text-muted-foreground">
					Download the Superset desktop app to run coding agents locally on your
					machine.
				</p>

				<div className="mb-12 flex flex-col gap-4 sm:flex-row">
					<Card className="w-64">
						<CardHeader className="text-center">
							<div className="mx-auto mb-2 text-4xl">🍎</div>
							<CardTitle>macOS</CardTitle>
							<CardDescription>For macOS 12.0 or later</CardDescription>
						</CardHeader>
						<CardContent>
							<Button className="w-full" disabled>
								<Download className="mr-2 h-4 w-4" />
								Coming Soon
							</Button>
						</CardContent>
					</Card>

					<Card className="w-64">
						<CardHeader className="text-center">
							<div className="mx-auto mb-2">
								<MonitorIcon className="mx-auto h-10 w-10" />
							</div>
							<CardTitle>Windows</CardTitle>
							<CardDescription>For Windows 10 or later</CardDescription>
						</CardHeader>
						<CardContent>
							<Button className="w-full" disabled>
								<Download className="mr-2 h-4 w-4" />
								Coming Soon
							</Button>
						</CardContent>
					</Card>
				</div>

				<div className="grid gap-4 sm:grid-cols-3">
					{[
						{
							icon: Laptop,
							title: "Local First",
							description: "Run agents on your own machine",
						},
						{
							icon: Zap,
							title: "10+ Parallel Agents",
							description: "Execute multiple tasks simultaneously",
						},
						{
							icon: Download,
							title: "Full Control",
							description: "Your code never leaves your computer",
						},
					].map((feature) => (
						<div
							key={feature.title}
							className="rounded-lg bg-card/80 p-4 shadow-sm"
						>
							<feature.icon className="mx-auto mb-2 h-5 w-5 text-blue-600 dark:text-blue-400" />
							<h3 className="font-semibold text-foreground">{feature.title}</h3>
							<p className="text-sm text-muted-foreground">
								{feature.description}
							</p>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
