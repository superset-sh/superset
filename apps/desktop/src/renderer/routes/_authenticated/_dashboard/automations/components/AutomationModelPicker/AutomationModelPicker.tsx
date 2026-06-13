import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorTrigger,
} from "@superset/ui/ai-elements/model-selector";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { VirtualizedModelList } from "renderer/components/Chat/ChatInterface/components/ModelPicker/components/VirtualizedModelList";
import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import {
	groupModelsByModelFamily,
	type ModelCatalogOption,
} from "renderer/components/Chat/ChatInterface/utils/modelOptions";
import { ModelProviderIcon } from "renderer/components/ModelProviderIcon";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import {
	type AutomationModelRunnerFamily,
	getAutomationModelRunnerFamily,
} from "../../utils/agentDisplay";

export interface AutomationModelSelection {
	providerId: string;
	modelId: string;
}

interface AutomationModelPickerProps {
	agent: string | null | undefined;
	agents: readonly AgentSelectAgent[];
	value: AutomationModelSelection | null;
	onChange: (selection: AutomationModelSelection | null) => void;
	className?: string;
	disabled?: boolean;
	align?: "start" | "end";
}

type ModelProvider = Awaited<
	ReturnType<typeof apiTrpcClient.modelProvider.list.query>
>[number];

function protocolsForFamily(
	family: AutomationModelRunnerFamily,
): Set<string> | null {
	if (family === "codex" || family === "opencode") {
		return new Set(["openai-chat", "openai-responses"]);
	}
	return null;
}

function modelOptionFromProvider(
	provider: ModelProvider,
	model: ModelProvider["models"][number],
): ModelCatalogOption {
	return {
		id: `${provider.id}/${model.modelId}`,
		name: model.displayName || model.modelId,
		provider: provider.name,
		providerId: provider.id,
		modelId: model.modelId,
		protocol: provider.protocol,
		baseUrl: provider.baseUrl,
		hasSecret: provider.hasSecret,
	};
}

function buildModelOptions(
	providers: ModelProvider[],
	family: AutomationModelRunnerFamily,
): ModelCatalogOption[] {
	const protocols = protocolsForFamily(family);
	return providers
		.filter(
			(provider) =>
				provider.enabled &&
				provider.hasSecret &&
				(!protocols || protocols.has(provider.protocol)),
		)
		.flatMap((provider) =>
			provider.models
				.filter((model) => model.enabled)
				.map((model) => modelOptionFromProvider(provider, model)),
		);
}

function selectedFromValue(
	models: ModelCatalogOption[],
	value: AutomationModelSelection | null,
): ModelCatalogOption | null {
	if (!value) return null;
	return (
		models.find(
			(model) =>
				model.providerId === value.providerId &&
				model.modelId === value.modelId,
		) ?? null
	);
}

export function AutomationModelPicker({
	agent,
	agents,
	value,
	onChange,
	className,
	disabled,
	align = "start",
}: AutomationModelPickerProps) {
	const [open, setOpen] = useState(false);
	const family = getAutomationModelRunnerFamily(agents, agent);
	const providersQuery = useQuery({
		queryKey: ["automation-model-providers"],
		queryFn: () => apiTrpcClient.modelProvider.list.query(),
		staleTime: 30_000,
	});

	const models = useMemo(
		() => (family ? buildModelOptions(providersQuery.data ?? [], family) : []),
		[family, providersQuery.data],
	);
	const selectedModel = selectedFromValue(models, value);
	const groupedModels = useMemo(
		() => groupModelsByModelFamily(models),
		[models],
	);

	if (!family) return null;

	const unavailableSelected = value && !selectedModel;
	const label = selectedModel
		? selectedModel.name
		: unavailableSelected
			? "Model unavailable"
			: providersQuery.isLoading
				? "Loading models"
				: "Default model";

	return (
		<ModelSelector open={open} onOpenChange={setOpen}>
			<ModelSelectorTrigger asChild>
				<PickerTrigger
					className={className}
					disabled={disabled || models.length === 0}
					icon={
						selectedModel ? (
							<ModelProviderIcon
								className="size-3.5"
								modelId={selectedModel.modelId ?? selectedModel.name}
								protocol={selectedModel.protocol}
								provider={selectedModel.provider}
							/>
						) : null
					}
					label={label}
					contentClassName={align === "end" ? "justify-end" : undefined}
					labelClassName={align === "end" ? "text-right" : undefined}
					endAdornment={
						selectedModel ? (
							<span className="text-muted-foreground">
								{selectedModel.provider}
							</span>
						) : null
					}
				/>
			</ModelSelectorTrigger>
			<ModelSelectorContent shouldFilter={false} title="Select Model">
				<VirtualizedModelList
					groupedModels={groupedModels}
					onSelectModel={(model: ModelOption) => {
						const option = model as ModelCatalogOption;
						if (!option.providerId || !option.modelId) return;
						onChange({
							providerId: option.providerId,
							modelId: option.modelId,
						});
					}}
					onCloseModelSelector={() => setOpen(false)}
				/>
			</ModelSelectorContent>
		</ModelSelector>
	);
}
