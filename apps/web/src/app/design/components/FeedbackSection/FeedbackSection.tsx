"use client";

import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
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
			title={i18n._(
				msg({
					message: "Feedback",
				}),
			)}
			description={i18n._(
				msg({
					message: "Alerts, toasts, progress, and loading states",
				}),
			)}
		>
			<ComponentCard
				title={i18n._(
					msg({
						message: "Alert",
					}),
				)}
				importPath="@superset/ui/alert"
				span
			>
				<div className="w-full space-y-3">
					<Alert>
						<TerminalIcon />
						<AlertTitle>
							<Trans>Agent session started</Trans>
						</AlertTitle>
						<AlertDescription>
							<Trans>
								Claude is now running in workspace component-showcase.
							</Trans>
						</AlertDescription>
					</Alert>
					<Alert variant="destructive">
						<AlertCircleIcon />
						<AlertTitle>
							<Trans>Worktree out of sync</Trans>
						</AlertTitle>
						<AlertDescription>
							<Trans>
								The remote branch has diverged. Pull before continuing.
							</Trans>
						</AlertDescription>
					</Alert>
				</div>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Toast (Sonner)",
					}),
				)}
				importPath="@superset/ui/sonner"
				description={i18n._(
					msg({
						message: "Toaster is mounted once in the root layout",
					}),
				)}
			>
				<Button
					variant="outline"
					onClick={() =>
						toast.success(
							i18n._(
								msg({
									message: "Workspace created",
								}),
							),
						)
					}
				>
					<Trans>Success</Trans>
				</Button>
				<Button
					variant="outline"
					onClick={() =>
						toast.error(
							i18n._(
								msg({
									message: "Failed to push branch",
								}),
							),
						)
					}
				>
					<Trans>Error</Trans>
				</Button>
				<Button
					variant="outline"
					onClick={() =>
						toast(
							i18n._(
								msg({
									message: "Agent finished",
								}),
							),
							{
								description: i18n._(
									msg({
										message: "3 files changed, 2 tests passing",
									}),
								),
								action: {
									label: i18n._(
										msg({
											message: "Review",
										}),
									),
									onClick: () => {},
								},
							},
						)
					}
				>
					<Trans>With action</Trans>
				</Button>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Progress · Spinner",
					}),
				)}
				importPath="@superset/ui/progress"
				description={i18n._(
					msg({
						message: "Also: @superset/ui/spinner",
					}),
				)}
			>
				<div className="flex w-full max-w-64 flex-col items-center gap-5">
					<Progress value={progress} />
					<div className="flex items-center gap-3 text-muted-foreground">
						<Spinner className="size-4" />
						<Spinner className="size-6" />
						<span className="text-sm">
							<Trans>Loading…</Trans>
						</span>
					</div>
				</div>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Skeleton",
					}),
				)}
				importPath="@superset/ui/skeleton"
			>
				<div className="flex w-full max-w-64 items-center gap-3">
					<Skeleton className="size-10 shrink-0 rounded-full" />
					<div className="w-full space-y-2">
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-4 w-1/2" />
					</div>
				</div>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Empty",
					}),
				)}
				importPath="@superset/ui/empty"
				span
			>
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<InboxIcon />
						</EmptyMedia>
						<EmptyTitle>
							<Trans>No tasks yet</Trans>
						</EmptyTitle>
						<EmptyDescription>
							<Trans>Create a task to kick off your first agent session.</Trans>
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button size="sm">
							<Trans>New task</Trans>
						</Button>
					</EmptyContent>
				</Empty>
			</ComponentCard>
		</ShowcaseSection>
	);
}
