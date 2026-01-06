"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { Skeleton } from "@superset/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import type { ReactNode } from "react";

interface LeaderboardEntry {
	userId: string;
	name: string;
	email: string;
	avatarUrl: string | null;
	count: number;
}

interface LeaderboardTableProps {
	title: string;
	description?: string;
	data: LeaderboardEntry[] | null | undefined;
	isLoading?: boolean;
	error?: { message: string } | null;
	countLabel?: string;
	headerAction?: ReactNode;
}

export function LeaderboardTable({
	title,
	description,
	data,
	isLoading,
	error,
	countLabel = "Count",
	headerAction,
}: LeaderboardTableProps) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle>{title}</CardTitle>
					{headerAction}
				</div>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="space-y-3">
						{["a", "b", "c", "d", "e"].map((id) => (
							<div key={id} className="flex items-center gap-3">
								<Skeleton className="h-8 w-8 rounded-full" />
								<div className="flex-1 space-y-1">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-3 w-48" />
								</div>
								<Skeleton className="h-4 w-8" />
							</div>
						))}
					</div>
				) : error ? (
					<div className="flex h-[200px] items-center justify-center">
						<p className="text-destructive text-sm">
							Failed to load leaderboard
						</p>
					</div>
				) : !data || data.length === 0 ? (
					<div className="flex h-[200px] items-center justify-center rounded-md border border-dashed">
						<p className="text-muted-foreground text-sm">
							No leaderboard data available for this period
						</p>
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[50px]">#</TableHead>
								<TableHead>User</TableHead>
								<TableHead className="text-right">{countLabel}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.map((entry, index) => (
								<TableRow key={entry.userId}>
									<TableCell className="font-medium">{index + 1}</TableCell>
									<TableCell>
										<div className="flex items-center gap-3">
											<Avatar className="h-8 w-8">
												<AvatarImage src={entry.avatarUrl ?? undefined} />
												<AvatarFallback>
													{entry.name
														.split(" ")
														.map((n) => n[0])
														.join("")
														.toUpperCase()
														.slice(0, 2)}
												</AvatarFallback>
											</Avatar>
											<div>
												<p className="font-medium">{entry.name}</p>
												<p className="text-muted-foreground text-sm">
													{entry.email}
												</p>
											</div>
										</div>
									</TableCell>
									<TableCell className="text-right font-mono">
										{entry.count}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
