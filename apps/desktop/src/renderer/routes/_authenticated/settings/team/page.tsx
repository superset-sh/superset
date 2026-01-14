import { Avatar } from "@superset/ui/atoms/Avatar";
import { Badge } from "@superset/ui/badge";
import { Skeleton } from "@superset/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { InviteMemberButton } from "./components/InviteMemberButton";
import { MemberActions } from "./components/MemberActions";

export const Route = createFileRoute("/_authenticated/settings/team/")({
	component: TeamSettingsPage,
});

function TeamSettingsPage() {
	const { data: session } = authClient.useSession();
	const collections = useCollections();

	const { data: membersData, isLoading } = useLiveQuery(
		(q) =>
			q
				.from({ members: collections.members })
				.leftJoin({ users: collections.users }, ({ members, users }) =>
					eq(members.userId, users.id),
				)
				.select(({ members, users }) => ({
					memberId: members.id,
					userId: members.userId,
					name: users?.name ?? null,
					email: users?.email ?? "",
					image: users?.image ?? null,
					role: members.role,
					joinedAt: members.createdAt,
					organizationId: members.organizationId,
				}))
				.orderBy(({ members }) => members.role, "asc")
				.orderBy(({ members }) => members.createdAt, "asc"),
		[collections],
	);

	const members = membersData ?? [];

	const currentUserId = session?.user?.id;
	const currentMember = members.find((m) => m.userId === currentUserId);
	const isOwner = currentMember?.role === "owner";

	const formatDate = (date: Date | string) => {
		const d = date instanceof Date ? date : new Date(date);
		return d.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	};

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<div className="p-8 border-b">
				<div className="max-w-5xl">
					<h2 className="text-2xl font-semibold">Organization</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Manage members in your organization
					</p>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<div className="p-8">
					<div className="max-w-5xl space-y-4">
						<div className="flex justify-end">
							<InviteMemberButton />
						</div>

						{isLoading ? (
							<div className="space-y-2 border rounded-lg">
								{[1, 2, 3].map((i) => (
									<div key={i} className="flex items-center gap-4 p-4">
										<Skeleton className="h-8 w-8 rounded-full" />
										<div className="flex-1 space-y-2">
											<Skeleton className="h-4 w-48" />
											<Skeleton className="h-3 w-32" />
										</div>
										<Skeleton className="h-4 w-16" />
										<Skeleton className="h-4 w-20" />
									</div>
								))}
							</div>
						) : members.length === 0 ? (
							<div className="text-center py-12 text-muted-foreground border rounded-lg">
								No members yet
							</div>
						) : (
							<div className="border rounded-lg">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Email</TableHead>
											<TableHead>Role</TableHead>
											<TableHead>Joined</TableHead>
											<TableHead className="w-[50px]" />
										</TableRow>
									</TableHeader>
									<TableBody>
										{members.map((member) => {
											const isCurrentUserRow = member.userId === currentUserId;

											return (
												<TableRow key={member.memberId}>
													<TableCell>
														<div className="flex items-center gap-3">
															<Avatar
																size="md"
																fullName={member.name}
																image={member.image}
															/>
															<div className="flex items-center gap-2">
																<span className="font-medium">
																	{member.name || "Unknown"}
																</span>
																{isCurrentUserRow && (
																	<Badge
																		variant="secondary"
																		className="text-xs"
																	>
																		You
																	</Badge>
																)}
															</div>
														</div>
													</TableCell>
													<TableCell className="text-muted-foreground">
														{member.email}
													</TableCell>
													<TableCell>
														<Badge
															variant={
																member.role === "owner" ? "default" : "outline"
															}
															className="text-xs capitalize"
														>
															{member.role}
														</Badge>
													</TableCell>
													<TableCell className="text-muted-foreground">
														{formatDate(member.joinedAt)}
													</TableCell>
													<TableCell>
														<MemberActions
															member={member}
															isCurrentUser={isCurrentUserRow}
															canRemove={
																isOwner &&
																!isCurrentUserRow &&
																member.role !== "owner"
															}
														/>
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
