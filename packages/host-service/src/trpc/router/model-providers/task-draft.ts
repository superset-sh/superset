import { TRPCError } from "@trpc/server";
import { handleModelGatewayRequest } from "../../../model-gateway/gateway";
import { listModelProviders } from "../../../model-providers/storage";
import type { HostServiceContext } from "../../../types";
import {
	extractTaskDraftFromGatewayResponse,
	type GeneratedTaskDraft,
	TASK_PRIORITIES,
} from "./task-draft-parser";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selectDraftModel(ctx: HostServiceContext): string | null {
	const provider = listModelProviders(ctx.db).find(
		(item) =>
			item.enabled &&
			item.hasSecret &&
			item.models.some((model) => model.enabled),
	);
	return provider?.models.find((model) => model.enabled)?.modelId ?? null;
}

const SYSTEM_PROMPT = [
	"You convert rough user intent into an editable task draft.",
	"Return concise, concrete fields. Do not create the task.",
	"Use priority only when the text makes urgency clear; otherwise use none.",
	"Use dueDate only when the user states an explicit calendar date in YYYY-MM-DD form.",
].join("\n");

export async function generateTaskDraft(args: {
	ctx: HostServiceContext;
	prompt: string;
}): Promise<GeneratedTaskDraft> {
	const model = selectDraftModel(args.ctx);
	if (!model) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "No enabled model provider is configured",
		});
	}
	if (!args.ctx.hostServiceSecret) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Model gateway is unavailable",
		});
	}

	const response = await handleModelGatewayRequest({
		db: args.ctx.db,
		internalToken: args.ctx.hostServiceSecret,
		request: new Request(
			`${args.ctx.hostServiceBaseUrl}/model-gateway/v1/messages`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${args.ctx.hostServiceSecret}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					model,
					system: SYSTEM_PROMPT,
					max_tokens: 800,
					temperature: 0.2,
					messages: [
						{
							role: "user",
							content: args.prompt,
						},
					],
					tools: [
						{
							name: "propose_task_draft",
							description: "Return an editable task draft.",
							input_schema: {
								type: "object",
								additionalProperties: false,
								required: ["title"],
								properties: {
									title: {
										type: "string",
										description: "Short task title.",
									},
									description: {
										type: "string",
										description: "Markdown task description.",
									},
									priority: {
										type: "string",
										enum: TASK_PRIORITIES,
									},
									labels: {
										type: "array",
										items: { type: "string" },
									},
									dueDate: {
										type: ["string", "null"],
										description: "YYYY-MM-DD or null.",
									},
								},
							},
						},
					],
					tool_choice: {
						type: "tool",
						name: "propose_task_draft",
					},
				}),
			},
		),
	});

	const body = (await response.json()) as unknown;
	if (!response.ok) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message:
				isRecord(body) &&
				isRecord(body.error) &&
				typeof body.error.message === "string"
					? body.error.message
					: "Model provider failed to draft the task",
		});
	}

	return extractTaskDraftFromGatewayResponse(body);
}
