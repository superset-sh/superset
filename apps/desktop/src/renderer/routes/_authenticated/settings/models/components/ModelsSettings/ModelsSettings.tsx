import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, RefreshCwIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	groupModelsByModelFamily,
	type ModelCatalogOption,
} from "renderer/components/Chat/ChatInterface/utils/modelOptions";
import { ModelProviderIcon } from "renderer/components/ModelProviderIcon";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import {
	chatModelsQueryKey,
	modelProvidersQueryKey,
	workspaceModelProvidersQueryKey,
} from "renderer/lib/model-provider-query-keys";
import { syncCloudModelProvidersToHost } from "renderer/lib/sync-cloud-model-providers";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { SettingsSection } from "./components/SettingsSection";

interface ModelsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

type ProviderProtocol = "anthropic" | "openai-chat" | "openai-responses";

interface ProviderModelForm {
	modelId: string;
	displayName: string;
	enabled: boolean;
}

interface ProviderForm {
	id: string | null;
	name: string;
	protocol: ProviderProtocol;
	baseUrl: string;
	enabled: boolean;
	secret: string;
	models: ProviderModelForm[];
}

const EMPTY_FORM: ProviderForm = {
	id: null,
	name: "",
	protocol: "anthropic",
	baseUrl: "",
	enabled: true,
	secret: "",
	models: [],
};

const PROTOCOL_LABEL: Record<ProviderProtocol, string> = {
	anthropic: "Anthropic-compatible",
	"openai-chat": "OpenAI Chat Completions",
	"openai-responses": "OpenAI Responses",
};

function normalizeModelId(value: string): string {
	return value.trim();
}

function formModelsFromProvider(
	models: Array<{ modelId: string; displayName: string; enabled: boolean }>,
): ProviderModelForm[] {
	return models.map((model) => ({
		modelId: model.modelId,
		displayName: model.displayName,
		enabled: model.enabled,
	}));
}

function parseModelInput(value: string): ProviderModelForm[] {
	return value
		.split(/[\n,]+/)
		.map(normalizeModelId)
		.filter(Boolean)
		.map((modelId) => ({
			modelId,
			displayName: modelId,
			enabled: true,
		}));
}

function mergeModels(
	current: ProviderModelForm[],
	incoming: ProviderModelForm[],
): ProviderModelForm[] {
	const seen = new Set(current.map((model) => model.modelId));
	const merged = [...current];
	for (const model of incoming) {
		if (seen.has(model.modelId)) continue;
		seen.add(model.modelId);
		merged.push(model);
	}
	return merged;
}

function modelsToRows(models: ProviderModelForm[]) {
	return models.map((model) => ({
		modelId: model.modelId,
		displayName: model.displayName || model.modelId,
		enabled: model.enabled,
	}));
}

function modelOptionsFromForm(form: ProviderForm): ModelCatalogOption[] {
	return form.models.map((model) => ({
		id: model.modelId,
		modelId: model.modelId,
		name: model.displayName || model.modelId,
		protocol: form.protocol,
		provider: form.name,
	}));
}

export function ModelsSettings({ visibleItems }: ModelsSettingsProps) {
	const shouldShow =
		isItemVisible(SETTING_ITEM_ID.MODELS_ANTHROPIC, visibleItems) ||
		isItemVisible(SETTING_ITEM_ID.MODELS_OPENAI, visibleItems);
	const { activeHostUrl, hostServiceStatus } = useLocalHostService();
	const queryClient = useQueryClient();
	const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
	const [modelInput, setModelInput] = useState("");
	const queryKey = useMemo(
		() => modelProvidersQueryKey(activeHostUrl),
		[activeHostUrl],
	);

	const invalidateProviderCaches = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey }),
			queryClient.invalidateQueries({
				queryKey: workspaceModelProvidersQueryKey(activeHostUrl),
			}),
			queryClient.invalidateQueries({
				queryKey: chatModelsQueryKey(activeHostUrl),
			}),
		]);
	};

	const providersQuery = useQuery({
		queryKey,
		enabled: shouldShow,
		queryFn: async () => {
			const providers = await apiTrpcClient.modelProvider.list.query();
			if (activeHostUrl) {
				await syncCloudModelProvidersToHost(activeHostUrl).catch((error) => {
					console.warn(
						"[models-settings] Failed to sync providers to host",
						error,
					);
				});
			}
			return providers;
		},
	});
	const providers = providersQuery.data ?? [];

	useEffect(() => {
		if (form.id !== null) return;
		const first = providers[0];
		if (!first) return;
		setForm({
			id: first.id,
			name: first.name,
			protocol: first.protocol,
			baseUrl: first.baseUrl,
			enabled: first.enabled,
			secret: "",
			models: formModelsFromProvider(first.models),
		});
	}, [form.id, providers]);

	const upsertMutation = useMutation({
		mutationFn: async (nextForm: ProviderForm) => {
			const models = modelsToRows(nextForm.models);
			if (models.length === 0) throw new Error("Add at least one model");
			return apiTrpcClient.modelProvider.upsert.mutate({
				id: nextForm.id ?? undefined,
				name: nextForm.name,
				protocol: nextForm.protocol,
				baseUrl: nextForm.baseUrl,
				enabled: nextForm.enabled,
				secret: nextForm.secret.trim() || undefined,
				models,
			});
		},
		onSuccess: async (saved) => {
			if (activeHostUrl) {
				await syncCloudModelProvidersToHost(activeHostUrl).catch((error) => {
					console.warn(
						"[models-settings] Failed to sync providers to host",
						error,
					);
				});
			}
			await invalidateProviderCaches();
			setForm({
				id: saved.id,
				name: saved.name,
				protocol: saved.protocol,
				baseUrl: saved.baseUrl,
				enabled: saved.enabled,
				secret: "",
				models: formModelsFromProvider(saved.models),
			});
			toast.success("Model provider saved");
		},
		onError: (error) => {
			toast.error(error instanceof Error ? error.message : "Failed to save");
		},
	});

	const fetchRemoteModelsMutation = useMutation({
		mutationFn: async (nextForm: ProviderForm) => {
			return apiTrpcClient.modelProvider.fetchRemoteModels.mutate({
				id: nextForm.id ?? undefined,
				protocol: nextForm.protocol,
				baseUrl: nextForm.baseUrl,
				secret: nextForm.secret.trim() || undefined,
			});
		},
		onSuccess: ({ models }) => {
			setForm((current) => ({
				...current,
				models: mergeModels(
					current.models,
					models.map((model) => ({ ...model, enabled: true })),
				),
			}));
			toast.success(`Fetched ${models.length} models`);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to fetch models",
			);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (providerId: string) => {
			return apiTrpcClient.modelProvider.delete.mutate({ id: providerId });
		},
		onSuccess: async () => {
			if (activeHostUrl) {
				await syncCloudModelProvidersToHost(activeHostUrl).catch((error) => {
					console.warn(
						"[models-settings] Failed to sync providers to host",
						error,
					);
				});
			}
			await invalidateProviderCaches();
			setForm(EMPTY_FORM);
			toast.success("Model provider deleted");
		},
		onError: (error) => {
			toast.error(error instanceof Error ? error.message : "Failed to delete");
		},
	});

	if (!shouldShow) return null;

	const selectedProvider = providers.find(
		(provider) => provider.id === form.id,
	);
	const groupedModels = groupModelsByModelFamily(
		modelOptionsFromForm(form),
	).map(
		([family, models]) => [family, models as ModelCatalogOption[]] as const,
	);
	const canSave =
		Boolean(activeHostUrl) &&
		form.name.trim().length > 0 &&
		form.baseUrl.trim().length > 0 &&
		form.models.length > 0;
	const canFetchRemoteModels =
		Boolean(activeHostUrl) &&
		form.baseUrl.trim().length > 0 &&
		(Boolean(form.secret.trim()) || Boolean(selectedProvider?.hasSecret));

	function selectProvider(provider: (typeof providers)[number]) {
		setForm({
			id: provider.id,
			name: provider.name,
			protocol: provider.protocol,
			baseUrl: provider.baseUrl,
			enabled: provider.enabled,
			secret: "",
			models: formModelsFromProvider(provider.models),
		});
		setModelInput("");
	}

	function addManualModels() {
		const models = parseModelInput(modelInput);
		if (models.length === 0) return;
		setForm((current) => ({
			...current,
			models: mergeModels(current.models, models),
		}));
		setModelInput("");
	}

	function removeModel(modelId: string) {
		setForm((current) => ({
			...current,
			models: current.models.filter((model) => model.modelId !== modelId),
		}));
	}

	return (
		<div className="w-full max-w-5xl p-6">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Models</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Manage model service providers, credentials, protocols, and model
					lists.
				</p>
			</div>

			<div className="grid gap-6 lg:grid-cols-[280px_1fr]">
				<SettingsSection
					title="Providers"
					description={
						activeHostUrl
							? "Local model gateway sources."
							: `Host service is ${hostServiceStatus}.`
					}
					action={
						<Button
							size="sm"
							variant="outline"
							onClick={() => {
								setForm(EMPTY_FORM);
								setModelInput("");
							}}
						>
							<PlusIcon className="size-3.5" />
							New
						</Button>
					}
				>
					<div className="space-y-2">
						{providers.length === 0 ? (
							<div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
								No providers configured.
							</div>
						) : (
							providers.map((provider) => (
								<button
									key={provider.id}
									type="button"
									onClick={() => selectProvider(provider)}
									className={`w-full rounded-md border p-3 text-left transition-colors ${
										form.id === provider.id
											? "border-primary bg-primary/5"
											: "border-border hover:bg-muted/50"
									}`}
								>
									<div className="flex items-center justify-between gap-2">
										<div className="flex min-w-0 items-center gap-2">
											<ModelProviderIcon
												className="size-4"
												modelId={provider.models[0]?.modelId}
												protocol={provider.protocol}
												provider={provider.name}
											/>
											<span className="truncate font-medium text-sm">
												{provider.name}
											</span>
										</div>
										<Badge variant={provider.enabled ? "default" : "secondary"}>
											{provider.enabled ? "On" : "Off"}
										</Badge>
									</div>
									<div className="mt-1 text-xs text-muted-foreground">
										{PROTOCOL_LABEL[provider.protocol]} ·{" "}
										{provider.models.length} models
									</div>
								</button>
							))
						)}
					</div>
				</SettingsSection>

				<SettingsSection
					title={form.id ? "Provider details" : "New provider"}
					description="Choose the upstream protocol once; Superset routes Chat and terminal agents through the gateway."
					action={
						selectedProvider?.hasSecret ? (
							<Badge variant="secondary">Credential saved</Badge>
						) : null
					}
				>
					<div className="grid gap-4">
						<div className="grid gap-1.5">
							<Label htmlFor="provider-name">Name</Label>
							<Input
								id="provider-name"
								value={form.name}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										name: event.target.value,
									}))
								}
								placeholder="My gateway"
							/>
						</div>

						<div className="grid gap-1.5">
							<Label>Protocol</Label>
							<Select
								value={form.protocol}
								onValueChange={(value) =>
									setForm((current) => ({
										...current,
										protocol: value as ProviderProtocol,
									}))
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(PROTOCOL_LABEL).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="grid gap-1.5">
							<Label htmlFor="provider-base-url">Base URL</Label>
							<Input
								id="provider-base-url"
								value={form.baseUrl}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										baseUrl: event.target.value,
									}))
								}
								placeholder="https://api.example.com"
								className="font-mono"
							/>
						</div>

						<div className="grid gap-1.5">
							<Label htmlFor="provider-secret">API key or token</Label>
							<Input
								id="provider-secret"
								type="password"
								value={form.secret}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										secret: event.target.value,
									}))
								}
								placeholder={
									selectedProvider?.hasSecret
										? "Saved credential (leave blank to keep)"
										: "Provider credential"
								}
								className="font-mono"
							/>
						</div>

						<div className="grid gap-2">
							<div className="flex items-center justify-between gap-3">
								<Label>Models</Label>
								<Button
									size="sm"
									variant="outline"
									onClick={() => fetchRemoteModelsMutation.mutate(form)}
									disabled={
										!canFetchRemoteModels || fetchRemoteModelsMutation.isPending
									}
								>
									<RefreshCwIcon
										className={`size-3.5 ${
											fetchRemoteModelsMutation.isPending ? "animate-spin" : ""
										}`}
									/>
									Fetch model list
								</Button>
							</div>

							<div className="min-h-28 rounded-md border bg-muted/10 p-3">
								{groupedModels.length === 0 ? (
									<div className="rounded-md border border-dashed p-4 text-center text-muted-foreground text-sm">
										No models added.
									</div>
								) : (
									<div className="grid gap-3">
										{groupedModels.map(([family, models]) => (
											<div key={family} className="grid gap-2">
												<div className="flex items-center gap-2">
													<ModelProviderIcon
														className="size-3.5"
														modelId={
															models[0]?.modelId ?? models[0]?.name ?? family
														}
														protocol={form.protocol}
														provider={form.name}
													/>
													<span className="font-medium text-xs">{family}</span>
													<span className="text-muted-foreground text-xs">
														{models.length}
													</span>
												</div>
												<div className="flex flex-wrap gap-2">
													{models.map((model) => (
														<button
															key={model.modelId ?? model.id}
															type="button"
															onClick={() =>
																removeModel(model.modelId ?? model.id)
															}
															className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-2 py-1 text-xs transition-colors hover:bg-muted"
															title={model.modelId ?? model.id}
														>
															<ModelProviderIcon
																className="size-3"
																modelId={model.modelId ?? model.name}
																protocol={form.protocol}
																provider={form.name}
															/>
															<span className="min-w-0 truncate">
																{model.name}
															</span>
															<XIcon className="size-3 text-muted-foreground" />
														</button>
													))}
												</div>
											</div>
										))}
									</div>
								)}
							</div>

							<div className="flex gap-2">
								<Input
									id="provider-model-add-input"
									value={modelInput}
									onChange={(event) => setModelInput(event.target.value)}
									onKeyDown={(event) => {
										if (event.key !== "Enter") return;
										event.preventDefault();
										addManualModels();
									}}
									placeholder="gpt-5.5"
									className="font-mono"
								/>
								<Button
									id="provider-model-add-button"
									type="button"
									variant="outline"
									onClick={addManualModels}
									disabled={parseModelInput(modelInput).length === 0}
								>
									<PlusIcon className="size-4" />
									Add
								</Button>
							</div>
						</div>

						<div className="flex items-center justify-between gap-3 border-t pt-4">
							<div className="flex items-center gap-2">
								<Button
									onClick={() => upsertMutation.mutate(form)}
									disabled={!canSave || upsertMutation.isPending}
								>
									Save provider
								</Button>
								<Button
									variant="outline"
									onClick={() =>
										setForm((current) => ({
											...current,
											enabled: !current.enabled,
										}))
									}
								>
									{form.enabled ? "Disable" : "Enable"}
								</Button>
							</div>
							{form.id ? (
								<Button
									variant="ghost"
									onClick={() => deleteMutation.mutate(form.id as string)}
									disabled={deleteMutation.isPending}
								>
									<Trash2Icon className="size-4" />
									Delete
								</Button>
							) : null}
						</div>
					</div>
				</SettingsSection>
			</div>
		</div>
	);
}
