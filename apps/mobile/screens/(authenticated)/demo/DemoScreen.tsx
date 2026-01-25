import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { ScrollView, Text, View } from "react-native";
import { OrganizationSwitcher } from "@/components/OrganizationSwitcher";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useCollections } from "@/providers/CollectionsProvider";

export function DemoScreen() {
	const collections = useCollections();

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const { data: allTasks } = useLiveQuery(
		(q) => q.from({ tasks: collections.tasks }),
		[collections],
	);

	const { data: activeTasks } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.where(({ tasks }) => isNull(tasks.deletedAt)),
		[collections],
	);

	const { data: taskStatuses } = useLiveQuery(
		(q) => q.from({ taskStatuses: collections.taskStatuses }),
		[collections],
	);

	const { data: repositories } = useLiveQuery(
		(q) => q.from({ repositories: collections.repositories }),
		[collections],
	);

	const { data: members } = useLiveQuery(
		(q) => q.from({ members: collections.members }),
		[collections],
	);

	const { data: users } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);

	const { data: invitations } = useLiveQuery(
		(q) => q.from({ invitations: collections.invitations }),
		[collections],
	);

	const { data: tasksWithStatus } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin({ status: collections.taskStatuses }, ({ tasks, status }) =>
					eq(tasks.statusId, status.id),
				)
				.select(({ tasks, status }) => ({
					id: tasks.id,
					title: tasks.title,
					statusName: status.name,
					statusColor: status.color,
				})),
		[collections],
	);

	return (
		<ScrollView className="flex-1 bg-background">
			<View className="p-6 gap-6">
				<View className="gap-2">
					<Text className="text-4xl font-bold">Electric Collections Demo</Text>
					<Text className="text-lg text-muted-foreground">
						Real-time synced data from Electric SQL
					</Text>
				</View>

				<OrganizationSwitcher />

				<Card>
					<CardHeader>
						<CardTitle>Organizations (Global)</CardTitle>
						<CardDescription>
							{organizations?.length || 0} total
						</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{organizations?.map((org) => (
							<Text key={org.id} className="text-sm">
								{org.name} {org.slug && `(@${org.slug})`}
							</Text>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Tasks</CardTitle>
						<CardDescription>
							{allTasks?.length || 0} total ({activeTasks?.length || 0} active)
						</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{activeTasks?.slice(0, 5).map((task) => (
							<Text key={task.id} className="text-sm">
								{task.title}
							</Text>
						))}
						{(activeTasks?.length || 0) > 5 && (
							<Text className="text-sm text-muted-foreground">
								...and {activeTasks?.length - 5} more
							</Text>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Task Statuses</CardTitle>
						<CardDescription>{taskStatuses?.length || 0} total</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{taskStatuses?.map((status) => (
							<View key={status.id} className="flex-row items-center gap-2">
								{status.color && (
									<View
										className="w-3 h-3 rounded-full"
										style={{ backgroundColor: status.color }}
									/>
								)}
								<Text className="text-sm">{status.name}</Text>
							</View>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Repositories</CardTitle>
						<CardDescription>{repositories?.length || 0} total</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{repositories?.slice(0, 5).map((repo) => (
							<Text key={repo.id} className="text-sm">
								{repo.name}
							</Text>
						))}
						{(repositories?.length || 0) > 5 && (
							<Text className="text-sm text-muted-foreground">
								...and {repositories?.length - 5} more
							</Text>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Members</CardTitle>
						<CardDescription>{members?.length || 0} total</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{members?.map((member) => (
							<Text key={member.id} className="text-sm">
								{member.role}
							</Text>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Users</CardTitle>
						<CardDescription>{users?.length || 0} total</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{users?.map((user) => (
							<Text key={user.id} className="text-sm">
								{user.name || user.email}
							</Text>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Invitations</CardTitle>
						<CardDescription>{invitations?.length || 0} total</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{invitations?.map((inv) => (
							<Text key={inv.id} className="text-sm">
								{inv.email} - {inv.status}
							</Text>
						))}
						{!invitations?.length && (
							<Text className="text-sm text-muted-foreground">
								No pending invitations
							</Text>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Advanced Query (Join)</CardTitle>
						<CardDescription>
							Tasks with their status names ({tasksWithStatus?.length || 0})
						</CardDescription>
					</CardHeader>
					<CardContent className="gap-2">
						{tasksWithStatus?.slice(0, 5).map((item) => (
							<View key={item.id} className="flex-row items-center gap-2">
								{item.statusColor && (
									<View
										className="w-2 h-2 rounded-full"
										style={{ backgroundColor: item.statusColor }}
									/>
								)}
								<Text className="text-sm flex-1">{item.title}</Text>
								<Text className="text-xs text-muted-foreground">
									{item.statusName}
								</Text>
							</View>
						))}
					</CardContent>
				</Card>
			</View>
		</ScrollView>
	);
}
