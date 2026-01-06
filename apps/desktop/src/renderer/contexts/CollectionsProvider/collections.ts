import { snakeCamelMapper } from "@electric-sql/client";
import type {
	SelectMember,
	SelectOrganization,
	SelectRepository,
	SelectTask,
	SelectUser,
} from "@superset/db/schema";
import type { AppRouter } from "@superset/trpc";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { env } from "../../env.renderer";

const columnMapper = snakeCamelMapper();
const electricUrl = `${env.NEXT_PUBLIC_API_URL}/api/electric/v1/shape`;

interface CreateCollectionsParams {
	token: string;
	activeOrgId: string;
}

export function createCollections({
	token,
	activeOrgId,
}: CreateCollectionsParams) {
	const headers = { Authorization: `Bearer ${token}` };

	const apiClient = createTRPCProxyClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
				headers,
				transformer: superjson,
			}),
		],
	});

	const tasks = createCollection(
		electricCollectionOptions<SelectTask>({
			id: `tasks-${activeOrgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "tasks",
					org: activeOrgId,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				const result = await apiClient.task.create.mutate(item);
				return { txid: result.txid };
			},
			onUpdate: async ({ transaction }) => {
				const { modified } = transaction.mutations[0];
				const result = await apiClient.task.update.mutate(modified);
				return { txid: result.txid };
			},
			onDelete: async ({ transaction }) => {
				const item = transaction.mutations[0].original;
				const result = await apiClient.task.delete.mutate(item.id);
				return { txid: result.txid };
			},
		}),
	);

	const repositories = createCollection(
		electricCollectionOptions<SelectRepository>({
			id: `repositories-${activeOrgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "repositories",
					org: activeOrgId,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				const result = await apiClient.repository.create.mutate(item);
				return { txid: result.txid };
			},
			onUpdate: async ({ transaction }) => {
				const { modified } = transaction.mutations[0];
				const result = await apiClient.repository.update.mutate(modified);
				return { txid: result.txid };
			},
		}),
	);

	const members = createCollection(
		electricCollectionOptions<SelectMember>({
			id: `members-${activeOrgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "auth.members",
					org: activeOrgId,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const users = createCollection(
		electricCollectionOptions<SelectUser>({
			id: `users-${activeOrgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "auth.users",
					org: activeOrgId,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const organizations = createCollection(
		electricCollectionOptions<SelectOrganization>({
			id: "organizations",
			shapeOptions: {
				url: electricUrl,
				params: { table: "auth.organizations" },
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	return { tasks, repositories, members, users, organizations };
}
