import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo, useState } from "react";
import {
	RefreshControl,
	ScrollView,
	useWindowDimensions,
	View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { OrganizationSwitcherSheet } from "./components/OrganizationSwitcherSheet";
import { ProjectSection } from "./components/ProjectSection";
import type { WorkspaceCardProps } from "./components/WorkspaceCard";
import { WorkspacesSkeleton } from "./components/WorkspacesSkeleton";

const ACTIVE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export function WorkspacesScreen() {
	const [refreshing, setRefreshing] = useState(false);
	const [sheetOpen, setSheetOpen] = useState(false);
	const { width } = useWindowDimensions();
	const collections = useCollections();
	const {
		organizations,
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	} = useOrganizations();

	const { data: projects, isLoading } = useLiveQuery(
		(q) => q.from({ projects: collections.projects }),
		[collections],
	);

	// Miller's Law — chunk into Active / Recent buckets so the user
	// is never scanning more than one cognitive group at a time.
	const { active, recent } = useMemo(() => {
		const now = Date.now();
		const cutoff = now - ACTIVE_THRESHOLD_MS;
		const buckets: {
			active: WorkspaceCardProps[];
			recent: WorkspaceCardProps[];
		} = { active: [], recent: [] };

		const sorted = [...(projects ?? [])].sort((a, b) => {
			const aTs = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
			const bTs = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
			return bTs - aTs;
		});

		for (const project of sorted) {
			const updatedTs = project.updatedAt
				? new Date(project.updatedAt).getTime()
				: 0;
			const card: WorkspaceCardProps = {
				id: project.id,
				name: project.name,
				repoLabel: `${project.repoOwner}/${project.repoName}`,
				branch: project.defaultBranch,
			};
			if (updatedTs >= cutoff) buckets.active.push(card);
			else buckets.recent.push(card);
		}

		return buckets;
	}, [projects]);

	const handleSwitchOrganization = (organizationId: string) => {
		setSheetOpen(false);
		switchOrganization(organizationId);
	};

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			// Electric collections sync in real-time, so a hard refetch isn't
			// exposed. preload() at minimum re-attaches the shape if it was
			// idle — and the RefreshControl gives the user a Doherty-friendly
			// "I heard you" tactile signal.
			await collections.projects.preload();
		} finally {
			setRefreshing(false);
		}
	}, [collections]);

	const isEmpty = !isLoading && (projects?.length ?? 0) === 0;

	return (
		<>
			<OrganizationHeaderButton
				name={activeOrganization?.name}
				logo={activeOrganization?.logo}
				onPress={() => setSheetOpen(true)}
			/>
			<ScrollView
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				<View className="px-4 pb-8 pt-2 gap-6">
					{isLoading ? (
						<WorkspacesSkeleton />
					) : isEmpty ? (
						<View className="items-center justify-center py-20">
							<Text className="text-center text-muted-foreground">
								No workspaces yet — create one to get started
							</Text>
						</View>
					) : (
						<>
							{active.length > 0 ? (
								<ProjectSection title="Active" items={active} />
							) : null}
							{recent.length > 0 ? (
								<ProjectSection
									title="Recent"
									items={recent}
									defaultCollapsed={active.length > 0}
								/>
							) : null}
						</>
					)}
				</View>
			</ScrollView>
			<OrganizationSwitcherSheet
				isPresented={sheetOpen}
				onIsPresentedChange={setSheetOpen}
				organizations={organizations}
				activeOrganizationId={activeOrganizationId}
				onSwitchOrganization={handleSwitchOrganization}
				width={width}
			/>
		</>
	);
}
