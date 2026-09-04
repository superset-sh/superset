"use client";

import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@superset/ui/carousel";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemSeparator,
	ItemTitle,
} from "@superset/ui/item";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { FolderGitIcon, MoreHorizontalIcon } from "lucide-react";
import { ComponentCard } from "../ComponentCard";
import { ShowcaseSection } from "../ShowcaseSection";

const SESSIONS = [
	{ workspace: "component-showcase", agent: "Claude", status: "Running" },
	{ workspace: "fix-auth-redirect", agent: "Codex", status: "Idle" },
	{ workspace: "bump-deps", agent: "Claude", status: "Done" },
];

export function DataSection() {
	return (
		<ShowcaseSection
			id="data"
			index="07"
			title={i18n._(
				msg({
					message: "Data display",
				}),
			)}
			description={i18n._(
				msg({
					message: "Badges, avatars, cards, tables, and lists",
				}),
			)}
		>
			<ComponentCard
				title={i18n._(msg({ message: "Badge" }))}
				importPath="@superset/ui/badge"
				description={i18n._(
					msg({
						message: "Includes the Superset-specific box variant",
					}),
				)}
			>
				<Badge>
					<Trans>Default</Trans>
				</Badge>
				<Badge variant="secondary">
					<Trans>Secondary</Trans>
				</Badge>
				<Badge variant="outline">
					<Trans>Outline</Trans>
				</Badge>
				<Badge variant="destructive">
					<Trans>Destructive</Trans>
				</Badge>
				<Badge variant="box">
					<Trans>Box</Trans>
				</Badge>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Avatar",
					}),
				)}
				importPath="@superset/ui/avatar"
			>
				<Avatar>
					<AvatarImage
						src="https://github.com/superset-sh.png"
						alt={i18n._(
							msg({
								message: "Superset",
							}),
						)}
					/>
					<AvatarFallback>
						<Trans>SS</Trans>
					</AvatarFallback>
				</Avatar>
				<Avatar>
					<AvatarFallback>
						<Trans>AP</Trans>
					</AvatarFallback>
				</Avatar>
				<div className="flex -space-x-2">
					{["A", "B", "C"].map((letter) => (
						<Avatar key={letter} className="ring-2 ring-background">
							<AvatarFallback>{letter}</AvatarFallback>
						</Avatar>
					))}
				</div>
			</ComponentCard>

			<ComponentCard
				title={i18n._(msg({ message: "Card" }))}
				importPath="@superset/ui/card"
			>
				<Card className="w-full max-w-72">
					<CardHeader>
						<CardTitle>
							<Trans>Notifications</Trans>
						</CardTitle>
						<CardDescription>
							<Trans>Choose when Superset pings you.</Trans>
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex items-center justify-between">
							<Label htmlFor="dsg-card-done">
								<Trans>Agent finished</Trans>
							</Label>
							<Switch id="dsg-card-done" defaultChecked />
						</div>
						<div className="flex items-center justify-between">
							<Label htmlFor="dsg-card-fail">
								<Trans>CI failed</Trans>
							</Label>
							<Switch id="dsg-card-fail" />
						</div>
					</CardContent>
					<CardFooter>
						<Button size="sm" className="w-full">
							<Trans>Save preferences</Trans>
						</Button>
					</CardFooter>
				</Card>
			</ComponentCard>

			<ComponentCard
				title={i18n._(msg({ message: "Item" }))}
				importPath="@superset/ui/item"
			>
				<ItemGroup className="w-full max-w-80">
					<Item>
						<ItemMedia variant="icon">
							<FolderGitIcon />
						</ItemMedia>
						<ItemContent>
							<ItemTitle>
								<Trans>component-showcase</Trans>
							</ItemTitle>
							<ItemDescription>
								<Trans>2 agents · 14 files changed</Trans>
							</ItemDescription>
						</ItemContent>
						<ItemActions>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={i18n._(
									msg({
										message: "More",
									}),
								)}
							>
								<MoreHorizontalIcon />
							</Button>
						</ItemActions>
					</Item>
					<ItemSeparator />
					<Item>
						<ItemMedia variant="icon">
							<FolderGitIcon />
						</ItemMedia>
						<ItemContent>
							<ItemTitle>
								<Trans>fix-auth-redirect</Trans>
							</ItemTitle>
							<ItemDescription>
								<Trans>Idle · branch pushed</Trans>
							</ItemDescription>
						</ItemContent>
					</Item>
				</ItemGroup>
			</ComponentCard>

			<ComponentCard
				title={i18n._(msg({ message: "Table" }))}
				importPath="@superset/ui/table"
				span
				bleed
			>
				<Table>
					<TableCaption>
						<Trans>Active agent sessions.</Trans>
					</TableCaption>
					<TableHeader>
						<TableRow>
							<TableHead>
								<Trans>Workspace</Trans>
							</TableHead>
							<TableHead>
								<Trans>Agent</Trans>
							</TableHead>
							<TableHead className="text-right">
								<Trans>Status</Trans>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{SESSIONS.map((session) => (
							<TableRow key={session.workspace}>
								<TableCell className="font-mono text-xs">
									{session.workspace}
								</TableCell>
								<TableCell>{session.agent}</TableCell>
								<TableCell className="text-right">
									<Badge
										variant={
											session.status === "Running" ? "default" : "secondary"
										}
									>
										{session.status}
									</Badge>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Carousel",
					}),
				)}
				importPath="@superset/ui/carousel"
				span
			>
				<Carousel className="w-full max-w-56">
					<CarouselContent>
						{[1, 2, 3, 4, 5].map((slide) => (
							<CarouselItem key={slide}>
								<div className="flex aspect-square items-center justify-center rounded-lg border bg-muted/40 font-mono text-3xl text-muted-foreground">
									{slide}
								</div>
							</CarouselItem>
						))}
					</CarouselContent>
					<CarouselPrevious />
					<CarouselNext />
				</Carousel>
			</ComponentCard>
		</ShowcaseSection>
	);
}
