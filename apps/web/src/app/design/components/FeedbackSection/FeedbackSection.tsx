"use client";

import { Alert, AlertDescription, AlertTitle } from "@superset/ui/alert";
import { Button } from "@superset/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { Progress } from "@superset/ui/progress";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { AlertCircleIcon, InboxIcon, TerminalIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { ComponentCard } from "../ComponentCard";
import { ShowcaseSection } from "../ShowcaseSection";

export function FeedbackSection() {
	const [progress, setProgress] = useState(20);

	useEffect(() => {
		const timer = setInterval(() => {
			setProgress((value) => (value >= 100 ? 20 : value + 20));
		}, 1500);
		return () => clearInterval(timer);
	}, []);

	return (
		<ShowcaseSection
			id="feedback"
			index="05"
			title="Feedback"
			description="Alerts, toasts, progress, and loading states"
		>
			<ComponentCard title="Alert" importPath="@superset/ui/alert" span>
				<div className="w-full space-y-3">
					<Alert>
						<TerminalIcon />
						<AlertTitle>Agent session started</AlertTitle>
						<AlertDescription>
							Claude is now running in workspace component-showcase.
						</AlertDescription>
					</Alert>
					<Alert variant="destructive">
						<AlertCircleIcon />
						<AlertTitle>Worktree out of sync</AlertTitle>
						<AlertDescription>
							The remote branch has diverged. Pull before continuing.
						</AlertDescription>
					</Alert>
				</div>
			</ComponentCard>

			<ComponentCard
				title="Toast (Sonner)"
				importPath="@superset/ui/sonner"
				description="Toaster is mounted once in the root layout"
			>
				<Button
					variant="outline"
					onClick={() => toast.success("Workspace created")}
				>
					Success
				</Button>
				<Button
					variant="outline"
					onClick={() => toast.error("Failed to push branch")}
				>
					Error
				</Button>
				<Button
					variant="outline"
					onClick={() =>
						toast("Agent finished", {
							description: "3 files changed, 2 tests passing",
							action: { label: "Review", onClick: () => {} },
						})
					}
				>
					With action
				</Button>
			</ComponentCard>

			<ComponentCard
				title="Progress · Spinner"
				importPath="@superset/ui/progress"
				description="Also: @superset/ui/spinner"
			>
				<div className="flex w-full max-w-64 flex-col items-center gap-5">
					<Progress value={progress} />
					<div className="flex items-center gap-3 text-muted-foreground">
						<Spinner className="size-4" />
						<Spinner className="size-6" />
						<span className="text-sm">Loading…</span>
					</div>
				</div>
			</ComponentCard>

			<ComponentCard title="Skeleton" importPath="@superset/ui/skeleton">
				<div className="flex w-full max-w-64 items-center gap-3">
					<Skeleton className="size-10 shrink-0 rounded-full" />
					<div className="w-full space-y-2">
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-4 w-1/2" />
					</div>
				</div>
			</ComponentCard>

			<ComponentCard title="Empty" importPath="@superset/ui/empty" span>
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<InboxIcon />
						</EmptyMedia>
						<EmptyTitle>No tasks yet</EmptyTitle>
						<EmptyDescription>
							Create a task to kick off your first agent session.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button size="sm">New task</Button>
					</EmptyContent>
				</Empty>
			</ComponentCard>
		</ShowcaseSection>
	);
}
