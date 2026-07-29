"use client";

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
			title="Data display"
			description="Badges, avatars, cards, tables, and lists"
		>
			<ComponentCard
				title="Badge"
				importPath="@superset/ui/badge"
				description="Includes the Superset-specific box variant"
			>
				<Badge>Default</Badge>
				<Badge variant="secondary">Secondary</Badge>
				<Badge variant="outline">Outline</Badge>
				<Badge variant="destructive">Destructive</Badge>
				<Badge variant="box">Box</Badge>
			</ComponentCard>

			<ComponentCard title="Avatar" importPath="@superset/ui/avatar">
				<Avatar>
					<AvatarImage
						src="https://github.com/superset-sh.png"
						alt="Superset"
					/>
					<AvatarFallback>SS</AvatarFallback>
				</Avatar>
				<Avatar>
					<AvatarFallback>AP</AvatarFallback>
				</Avatar>
				<div className="flex -space-x-2">
					{["A", "B", "C"].map((letter) => (
						<Avatar key={letter} className="ring-2 ring-background">
							<AvatarFallback>{letter}</AvatarFallback>
						</Avatar>
					))}
				</div>
			</ComponentCard>

			<ComponentCard title="Card" importPath="@superset/ui/card">
				<Card className="w-full max-w-72">
					<CardHeader>
						<CardTitle>Notifications</CardTitle>
						<CardDescription>Choose when Superset pings you.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex items-center justify-between">
							<Label htmlFor="dsg-card-done">Agent finished</Label>
							<Switch id="dsg-card-done" defaultChecked />
						</div>
						<div className="flex items-center justify-between">
							<Label htmlFor="dsg-card-fail">CI failed</Label>
							<Switch id="dsg-card-fail" />
						</div>
					</CardContent>
					<CardFooter>
						<Button size="sm" className="w-full">
							Save preferences
						</Button>
					</CardFooter>
				</Card>
			</ComponentCard>

			<ComponentCard title="Item" importPath="@superset/ui/item">
				<ItemGroup className="w-full max-w-80">
					<Item>
						<ItemMedia variant="icon">
							<FolderGitIcon />
						</ItemMedia>
						<ItemContent>
							<ItemTitle>component-showcase</ItemTitle>
							<ItemDescription>2 agents · 14 files changed</ItemDescription>
						</ItemContent>
						<ItemActions>
							<Button variant="ghost" size="icon-sm" aria-label="More">
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
							<ItemTitle>fix-auth-redirect</ItemTitle>
							<ItemDescription>Idle · branch pushed</ItemDescription>
						</ItemContent>
					</Item>
				</ItemGroup>
			</ComponentCard>

			<ComponentCard title="Table" importPath="@superset/ui/table" span bleed>
				<Table>
					<TableCaption>Active agent sessions.</TableCaption>
					<TableHeader>
						<TableRow>
							<TableHead>Workspace</TableHead>
							<TableHead>Agent</TableHead>
							<TableHead className="text-right">Status</TableHead>
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

			<ComponentCard title="Carousel" importPath="@superset/ui/carousel" span>
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
