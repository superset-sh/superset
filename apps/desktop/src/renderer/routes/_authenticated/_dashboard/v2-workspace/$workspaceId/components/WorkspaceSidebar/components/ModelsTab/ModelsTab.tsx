import type { AppRouter } from "@superset/host-service";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Label } from "@superset/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { CheckIcon, ChevronDownIcon, SaveIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	filterModelGroupsBySearch,
	groupModelsByModelFamily,
	type ModelCatalogOption,
} from "renderer/components/Chat/ChatInterface/utils/modelOptions";
import { ModelProviderIcon } from "renderer/components/ModelProviderIcon";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ModelProvider = RouterOutputs["modelProviders"]["list"][number];

interface ModelsTabProps {
	workspaceId: string;
}

interface ClaudeModelForm {
	providerId: string;
	haikuModelId: string;
	sonnetModelId: string;
	opusModelId: string;
	disableOneMillionContext: boolean;
}

const EMPTY_FORM: ClaudeModelForm = {
	providerId: "",
	haikuModelId: "",
	sonnetModelId: "",
	opusModelId: "",
	disableOneMillionContext: true,
};

function modelOptionFromProvider(
	provider: ModelProvider,
	model: ModelProvider["models"][number],
): ModelCatalogOption {
	return {
		id: `${provider.id}/${model.modelId}`,
		modelId: model.modelId,
		name: model.displayName || model.modelId,
		protocol: provider.protocol,
		provider: provider.name,
		providerId: provider.id,
	};
}

function enabledModelOptionsForProvider(
	provider: ModelProvider | undefined,
): ModelCatalogOption[] {
	if (!provider) return [];
	return groupModelsByModelFamily(
		provider.models
			.filter((model) => model.enabled)
			.map((model) => modelOptionFromProvider(provider, model)),
	).flatMap(([, models]) => models as ModelCatalogOption[]);
}

function firstModelId(provider: ModelProvider | undefined): string {
	return enabledModelOptionsForProvider(provider)[0]?.modelId ?? "";
}

function normalizeFormForProvider(
	current: ClaudeModelForm,
	provider: ModelProvider | undefined,
): ClaudeModelForm {
	const enabledModelIds = new Set(
		enabledModelOptionsForProvider(provider)
			.map((model) => model.modelId)
			.filter((modelId): modelId is string => Boolean(modelId)),
	);
	const fallback = firstModelId(provider);
	return {
		...current,
		providerId: provider?.id ?? "",
		haikuModelId: enabledModelIds.has(current.haikuModelId)
			? current.haikuModelId
			: fallback,
		sonnetModelId: enabledModelIds.has(current.sonnetModelId)
			? current.sonnetModelId
			: fallback,
		opusModelId: enabledModelIds.has(current.opusModelId)
			? current.opusModelId
			: fallback,
	};
}

function ProviderSelect({
	value,
	providers,
	loading,
	onChange,
}: {
	value: string;
	providers: ModelProvider[];
	loading: boolean;
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const selectedProvider = providers.find((provider) => provider.id === value);
	const filteredProviders = providers.filter((provider) => {
		const query = search.trim().toLowerCase();
		if (!query) return true;
		return [
			provider.name,
			provider.protocol,
			provider.baseUrl,
			...provider.models.map((model) => model.displayName || model.modelId),
		]
			.join(" ")
			.toLowerCase()
			.includes(query);
	});

	return (
		<div className="grid gap-1.5">
			<Label className="text-xs">Provider</Label>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						className="h-8 w-full justify-between gap-2 px-2 text-xs"
						disabled={providers.length === 0}
						role="combobox"
						variant="outline"
					>
						<span className="flex min-w-0 items-center gap-2">
							{selectedProvider ? (
								<ModelProviderIcon
									className="size-3.5"
									modelId={selectedProvider.models[0]?.modelId}
									protocol={selectedProvider.protocol}
									provider={selectedProvider.name}
								/>
							) : null}
							<span className="truncate">
								{selectedProvider?.name ??
									(loading ? "Loading providers" : "Select provider")}
							</span>
						</span>
						<ChevronDownIcon className="size-3 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-(--radix-popover-trigger-width) p-0"
					onWheel={(event) => event.stopPropagation()}
				>
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search providers..."
							value={search}
							onValueChange={setSearch}
						/>
						<CommandList className="max-h-72">
							<CommandEmpty>No providers found.</CommandEmpty>
							<CommandGroup>
								{filteredProviders.map((provider) => (
									<CommandItem
										key={provider.id}
										value={provider.id}
										onSelect={() => {
											onChange(provider.id);
											setOpen(false);
											setSearch("");
										}}
									>
										<ModelProviderIcon
											className="size-3.5"
											modelId={provider.models[0]?.modelId}
											protocol={provider.protocol}
											provider={provider.name}
										/>
										<div className="min-w-0 flex-1">
											<div className="truncate">{provider.name}</div>
											<div className="truncate text-muted-foreground text-xs">
												{
													provider.models.filter((model) => model.enabled)
														.length
												}{" "}
												models
											</div>
										</div>
										<CheckIcon
											className={cn(
												"size-3",
												value === provider.id ? "opacity-100" : "opacity-0",
											)}
										/>
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}

function ModelSlotSelect({
	label,
	value,
	models,
	onChange,
}: {
	label: string;
	value: string;
	models: ModelCatalogOption[];
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const selectedModel = models.find((model) => model.modelId === value);
	const groupedModels = useMemo(
		() => groupModelsByModelFamily(models),
		[models],
	);
	const visibleGroups = useMemo(
		() => filterModelGroupsBySearch(groupedModels, search),
		[groupedModels, search],
	);

	return (
		<div className="grid gap-1.5">
			<Label className="text-xs">{label}</Label>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						className="h-8 w-full justify-between gap-2 px-2 text-xs"
						disabled={models.length === 0}
						role="combobox"
						variant="outline"
					>
						<span className="flex min-w-0 items-center gap-2">
							{selectedModel ? (
								<ModelProviderIcon
									className="size-3.5"
									modelId={selectedModel.modelId ?? selectedModel.name}
									protocol={selectedModel.protocol}
									provider={selectedModel.provider}
								/>
							) : null}
							<span className="truncate">
								{selectedModel?.name ?? "Select model"}
							</span>
						</span>
						<ChevronDownIcon className="size-3 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-(--radix-popover-trigger-width) p-0"
					onWheel={(event) => event.stopPropagation()}
				>
					<Command shouldFilter={false}>
						<CommandInput
							placeholder={`Search ${label.toLowerCase()} models...`}
							value={search}
							onValueChange={setSearch}
						/>
						<CommandList className="max-h-72">
							<CommandEmpty>No models found.</CommandEmpty>
							{visibleGroups.map(([family, familyModels]) => (
								<CommandGroup key={family} heading={family}>
									{familyModels.map((model) => (
										<CommandItem
											key={model.id}
											value={model.id}
											onSelect={() => {
												onChange(
													(model as ModelCatalogOption).modelId ?? model.id,
												);
												setOpen(false);
												setSearch("");
											}}
										>
											<ModelProviderIcon
												className="size-3.5"
												modelId={
													(model as ModelCatalogOption).modelId ?? model.name
												}
												protocol={(model as ModelCatalogOption).protocol}
												provider={model.provider}
											/>
											<div className="min-w-0 flex-1">
												<div className="truncate">{model.name}</div>
												<div className="truncate text-muted-foreground text-xs">
													{model.provider}
												</div>
											</div>
											<CheckIcon
												className={cn(
													"size-3",
													value === (model as ModelCatalogOption).modelId
														? "opacity-100"
														: "opacity-0",
												)}
											/>
										</CommandItem>
									))}
								</CommandGroup>
							))}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}

export function ModelsTab({ workspaceId }: ModelsTabProps) {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const [form, setForm] = useState<ClaudeModelForm>(EMPTY_FORM);

	const providersQueryKey = useMemo(
		() => ["workspace-model-providers", hostUrl] as const,
		[hostUrl],
	);
	const configQueryKey = useMemo(
		() => ["workspace-claude-model-config", hostUrl, workspaceId] as const,
		[hostUrl, workspaceId],
	);

	const providersQuery = useQuery({
		queryKey: providersQueryKey,
		enabled: Boolean(hostUrl),
		queryFn: async () => {
			if (!hostUrl) return [];
			return getHostServiceClientByUrl(hostUrl).modelProviders.list.query();
		},
	});
	const configQuery = useQuery({
		queryKey: configQueryKey,
		enabled: Boolean(hostUrl),
		queryFn: async () => {
			if (!hostUrl) return null;
			return getHostServiceClientByUrl(
				hostUrl,
			).modelProviders.getWorkspaceClaudeConfig.query({ workspaceId });
		},
	});

	const providers = providersQuery.data ?? [];
	const eligibleProviders = useMemo(
		() =>
			providers.filter(
				(provider) =>
					provider.enabled &&
					provider.hasSecret &&
					provider.models.some((model) => model.enabled),
			),
		[providers],
	);
	const selectedProvider = providers.find(
		(provider) => provider.id === form.providerId,
	);
	const selectedModels = useMemo(
		() => enabledModelOptionsForProvider(selectedProvider),
		[selectedProvider],
	);

	useEffect(() => {
		const savedConfig = configQuery.data;
		if (savedConfig) {
			setForm({
				providerId: savedConfig.providerId,
				haikuModelId: savedConfig.haikuModelId,
				sonnetModelId: savedConfig.sonnetModelId,
				opusModelId: savedConfig.opusModelId,
				disableOneMillionContext: savedConfig.disableOneMillionContext,
			});
			return;
		}

		setForm((current) => {
			if (current.providerId || eligibleProviders.length === 0) return current;
			return normalizeFormForProvider(current, eligibleProviders[0]);
		});
	}, [configQuery.data, eligibleProviders]);

	useEffect(() => {
		if (!form.providerId) return;
		setForm((current) => {
			const provider = providers.find((item) => item.id === current.providerId);
			if (!provider) return current;
			return normalizeFormForProvider(current, provider);
		});
	}, [form.providerId, providers]);

	const saveMutation = useMutation({
		mutationFn: async (nextForm: ClaudeModelForm) => {
			if (!hostUrl) throw new Error("Host service is not available");
			return getHostServiceClientByUrl(
				hostUrl,
			).modelProviders.saveWorkspaceClaudeConfig.mutate({
				workspaceId,
				providerId: nextForm.providerId,
				haikuModelId: nextForm.haikuModelId,
				sonnetModelId: nextForm.sonnetModelId,
				opusModelId: nextForm.opusModelId,
				disableOneMillionContext: nextForm.disableOneMillionContext,
			});
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: configQueryKey });
			toast.success("Claude Code models saved");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to save Claude Code models",
			);
		},
	});

	const canSave =
		Boolean(hostUrl) &&
		Boolean(selectedProvider?.enabled) &&
		Boolean(selectedProvider?.hasSecret) &&
		form.haikuModelId.length > 0 &&
		form.sonnetModelId.length > 0 &&
		form.opusModelId.length > 0;
	const loading =
		(Boolean(hostUrl) && providersQuery.isLoading) ||
		(Boolean(hostUrl) && configQuery.isLoading);
	const error = providersQuery.error ?? configQuery.error;

	return (
		<div className="flex h-full min-h-0 flex-col overflow-auto">
			<div className="grid gap-4 p-4">
				{!hostUrl ? (
					<div className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
						Waiting for this workspace host.
					</div>
				) : null}

				{error ? (
					<div className="select-text rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm">
						{error instanceof Error ? error.message : "Failed to load models"}
					</div>
				) : null}

				<ProviderSelect
					loading={loading}
					providers={eligibleProviders}
					value={form.providerId}
					onChange={(providerId) => {
						const provider = providers.find((item) => item.id === providerId);
						setForm((current) =>
							normalizeFormForProvider({ ...current, providerId }, provider),
						);
					}}
				/>

				<div className="grid gap-1.5">
					{providers.length > 0 && eligibleProviders.length === 0 ? (
						<p className="text-muted-foreground text-xs">
							Enable a provider, save a credential, and add at least one model.
						</p>
					) : null}
				</div>

				<div className="grid gap-3">
					<ModelSlotSelect
						label="Haiku"
						value={form.haikuModelId}
						models={selectedModels}
						onChange={(haikuModelId) =>
							setForm((current) => ({ ...current, haikuModelId }))
						}
					/>
					<ModelSlotSelect
						label="Sonnet"
						value={form.sonnetModelId}
						models={selectedModels}
						onChange={(sonnetModelId) =>
							setForm((current) => ({ ...current, sonnetModelId }))
						}
					/>
					<ModelSlotSelect
						label="Opus"
						value={form.opusModelId}
						models={selectedModels}
						onChange={(opusModelId) =>
							setForm((current) => ({ ...current, opusModelId }))
						}
					/>
				</div>

				<div className="flex items-center justify-between gap-3 rounded-md border p-3">
					<div className="min-w-0">
						<div className="font-medium text-sm">Disable 1M context</div>
						<div className="text-muted-foreground text-xs">
							Writes CLAUDE_CODE_DISABLE_1M_CONTEXT for this worktree.
						</div>
					</div>
					<Switch
						checked={form.disableOneMillionContext}
						onCheckedChange={(disableOneMillionContext) =>
							setForm((current) => ({
								...current,
								disableOneMillionContext,
							}))
						}
					/>
				</div>

				<Button
					className="w-full"
					disabled={!canSave || saveMutation.isPending}
					onClick={() => saveMutation.mutate(form)}
				>
					<SaveIcon className="size-4" />
					Save Claude Code Models
				</Button>
			</div>
		</div>
	);
}
