import { getHostServiceHeaders } from "renderer/lib/host-service-auth";
import { z } from "zod";
import type {
	FactoryBoardKind,
	FactoryProject,
	FactoryStage,
	FactoryWorkItem,
} from "../types";

const projectSchema = z.object({
	id: z.string(),
	name: z.string(),
	defaultModelId: z.string().nullable().optional(),
});

const workItemSchema = z.object({
	id: z.string(),
	factoryProjectId: z.string(),
	externalSource: z
		.object({
			integrationId: z.string(),
			type: z.string(),
			externalId: z.string(),
			url: z.string().optional(),
		})
		.nullable(),
	title: z.string(),
	stages: z.array(z.string()),
	stageHistory: z.array(
		z.object({
			stage: z.string(),
			enteredAt: z.string(),
			exitedAt: z.string().optional(),
			by: z.string(),
		}),
	),
	metadata: z.record(z.string(), z.unknown()).nullable(),
	revision: z.number(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

async function requestFactoryJson<T>(
	hostUrl: string,
	path: string,
	schema: z.ZodType<T>,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(`${hostUrl}/factory${path}`, {
		...init,
		headers: {
			Accept: "application/json",
			...getHostServiceHeaders(hostUrl),
			...(init?.body ? { "Content-Type": "application/json" } : {}),
			...init?.headers,
		},
	});
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			error?: string;
			message?: string;
		} | null;
		throw new Error(
			body?.message ??
				body?.error ??
				`Factory request failed (${response.status})`,
		);
	}
	return schema.parse(await response.json());
}

function sourceFromExternal(
	externalSource: z.infer<typeof workItemSchema>["externalSource"],
): FactoryWorkItem["source"] {
	if (!externalSource) return "manual";
	if (externalSource.integrationId === "github") {
		return externalSource.type === "pull-request"
			? "github-pr"
			: "github-issue";
	}
	return externalSource.integrationId === "linear" ? "linear-issue" : "manual";
}

function toWorkItem(item: z.infer<typeof workItemSchema>): FactoryWorkItem {
	return {
		id: item.id,
		factoryProjectId: item.factoryProjectId,
		source: sourceFromExternal(item.externalSource),
		sourceKey: item.externalSource?.externalId ?? null,
		title: item.title,
		url: item.externalSource?.url ?? null,
		stages: item.stages,
		stageHistory: item.stageHistory,
		metadata: item.metadata ?? {},
		revision: item.revision,
		createdAt: item.createdAt,
		updatedAt: item.updatedAt,
	};
}

export async function listFactoryProjects(
	hostUrl: string,
): Promise<FactoryProject[]> {
	const result = await requestFactoryJson(
		hostUrl,
		"/web/factory/projects",
		z.object({ projects: z.array(projectSchema) }),
	);
	return result.projects;
}

export async function createFactoryProject(
	hostUrl: string,
	name: string,
): Promise<FactoryProject> {
	const result = await requestFactoryJson(
		hostUrl,
		"/web/factory/projects",
		z.object({ project: projectSchema }),
		{
			method: "POST",
			body: JSON.stringify({
				name,
				description:
					"Superset-native software delivery factory powered by Mastra.",
			}),
		},
	);
	return result.project;
}

export async function listFactoryWorkItems(
	hostUrl: string,
	factoryProjectId: string,
): Promise<FactoryWorkItem[]> {
	const result = await requestFactoryJson(
		hostUrl,
		`/web/factory/projects/${encodeURIComponent(factoryProjectId)}/work-items`,
		z.object({ workItems: z.array(workItemSchema) }),
	);
	return result.workItems.map(toWorkItem);
}

export async function createManualFactoryWorkItem(
	hostUrl: string,
	factoryProjectId: string,
	title: string,
): Promise<FactoryWorkItem> {
	const result = await requestFactoryJson(
		hostUrl,
		`/web/factory/projects/${encodeURIComponent(factoryProjectId)}/work-items`,
		z.object({ workItem: workItemSchema }),
		{
			method: "POST",
			body: JSON.stringify({
				title,
				stages: ["intake"],
				metadata: { board: "work", decision: "Investigate request" },
			}),
		},
	);
	return toWorkItem(result.workItem);
}

export async function transitionFactoryWorkItem(
	hostUrl: string,
	factoryProjectId: string,
	item: FactoryWorkItem,
	board: FactoryBoardKind,
	stage: FactoryStage,
): Promise<void> {
	await requestFactoryJson(
		hostUrl,
		`/web/factory/projects/${encodeURIComponent(factoryProjectId)}/work-items/${encodeURIComponent(item.id)}/transition`,
		z.object({ result: z.object({ status: z.string() }).passthrough() }),
		{
			method: "POST",
			body: JSON.stringify({
				board,
				stage,
				expectedRevision: item.revision,
				requestId: crypto.randomUUID(),
				cause: "superset-factory-human-decision",
			}),
		},
	);
}
