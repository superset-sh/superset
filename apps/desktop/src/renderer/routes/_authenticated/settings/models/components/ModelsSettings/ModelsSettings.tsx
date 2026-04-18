import { chatServiceTrpc } from "@superset/chat/client";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { claudeIcon } from "@superset/ui/icons/preset-icons";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useMemo, useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { AnthropicOAuthDialog } from "renderer/components/Chat/ChatInterface/components/ModelPicker/components/AnthropicOAuthDialog";
import { OpenAIOAuthDialog } from "renderer/components/Chat/ChatInterface/components/ModelPicker/components/OpenAIOAuthDialog";
import { useAnthropicOAuth } from "renderer/components/Chat/ChatInterface/components/ModelPicker/hooks/useAnthropicOAuth";
import { useOpenAIOAuth } from "renderer/components/Chat/ChatInterface/components/ModelPicker/hooks/useOpenAIOAuth";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { ConfigRow } from "./components/ConfigRow";
import { SettingsSection } from "./components/SettingsSection";
import {
	buildAnthropicEnvText,
	EMPTY_ANTHROPIC_FORM,
	getProviderAction,
	getStatusBadge,
	parseAnthropicForm,
	resolveProviderStatus,
} from "./utils";

interface ModelsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

const DIALOG_CONTEXT = {
	isModelSelectorOpen: true,
	onModelSelectorOpenChange: () => {},
} as const;

export function ModelsSettings({ visibleItems }: ModelsSettingsProps) {
	const showAnthropic = isItemVisible(
		SETTING_ITEM_ID.MODELS_ANTHROPIC,
		visibleItems,
	);
	const showOpenAI = isItemVisible(SETTING_ITEM_ID.MODELS_OPENAI, visibleItems);
	const [overrideOpen, setOverrideOpen] = useState(true);
	const [openAIApiKeyInput, setOpenAIApiKeyInput] = useState("");
	const [anthropicApiKeyInput, setAnthropicApiKeyInput] = useState("");
	const [anthropicForm, setAnthropicForm] = useState(EMPTY_ANTHROPIC_FORM);

	const { data: anthropicAuthStatus, refetch: refetchAnthropicAuthStatus } =
		chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const { data: openAIAuthStatus, refetch: refetchOpenAIAuthStatus } =
		chatServiceTrpc.auth.getOpenAIStatus.useQuery();
	const { data: anthropicEnvConfig, refetch: refetchAnthropicEnvConfig } =
		chatServiceTrpc.auth.getAnthropicEnvConfig.useQuery();
	const setAnthropicApiKeyMutation =
		chatServiceTrpc.auth.setAnthropicApiKey.useMutation();
	const clearAnthropicApiKeyMutation =
		chatServiceTrpc.auth.clearAnthropicApiKey.useMutation();
	const setAnthropicEnvConfigMutation =
		chatServiceTrpc.auth.setAnthropicEnvConfig.useMutation();
	const clearAnthropicEnvConfigMutation =
		chatServiceTrpc.auth.clearAnthropicEnvConfig.useMutation();
	const setOpenAIApiKeyMutation =
		chatServiceTrpc.auth.setOpenAIApiKey.useMutation();
	const clearOpenAIApiKeyMutation =
		chatServiceTrpc.auth.clearOpenAIApiKey.useMutation();

	const {
		isStartingOAuth: isStartingAnthropicOAuth,
		startAnthropicOAuth,
		oauthDialog: anthropicOAuthDialog,
	} = useAnthropicOAuth({
		...DIALOG_CONTEXT,
		onAuthStateChange: async () => {
			await refetchAnthropicAuthStatus();
		},
	});
	const {
		isStartingOAuth: isStartingOpenAIOAuth,
		startOpenAIOAuth,
		oauthDialog: openAIOAuthDialog,
	} = useOpenAIOAuth(DIALOG_CONTEXT);

	const hasAnthropicConfig = !!anthropicEnvConfig?.envText.trim().length;
	const isSavingAnthropicApiKey =
		setAnthropicApiKeyMutation.isPending ||
		clearAnthropicApiKeyMutation.isPending;
	const isSavingAnthropicConfig =
		setAnthropicEnvConfigMutation.isPending ||
		clearAnthropicEnvConfigMutation.isPending;
	const isSavingOpenAIConfig =
		setOpenAIApiKeyMutation.isPending || clearOpenAIApiKeyMutation.isPending;

	useEffect(() => {
		setAnthropicForm(parseAnthropicForm(anthropicEnvConfig?.envText ?? ""));
		setAnthropicApiKeyInput("");
	}, [anthropicEnvConfig?.envText]);

	const anthropicStatus = useMemo(
		() =>
			resolveProviderStatus({
				providerId: "anthropic",
				authStatus: anthropicAuthStatus,
			}),
		[anthropicAuthStatus],
	);

	const openAIStatus = useMemo(
		() =>
			resolveProviderStatus({
				providerId: "openai",
				authStatus: openAIAuthStatus,
			}),
		[openAIAuthStatus],
	);

	const anthropicBadge = useMemo(
		() => getStatusBadge(anthropicStatus),
		[anthropicStatus],
	);
	const openAIBadge = useMemo(
		() => getStatusBadge(openAIStatus),
		[openAIStatus],
	);

	const saveAnthropicForm = async (nextForm = anthropicForm) => {
		const envText = buildAnthropicEnvText(nextForm);
		try {
			if (envText) {
				await setAnthropicEnvConfigMutation.mutateAsync({ envText });
			} else {
				await clearAnthropicEnvConfigMutation.mutateAsync();
			}
			await Promise.all([
				refetchAnthropicEnvConfig(),
				refetchAnthropicAuthStatus(),
			]);
			toast.success("Anthropic settings updated");
			return true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save");
			return false;
		}
	};

	const saveAnthropicApiKey = async () => {
		const apiKey = anthropicApiKeyInput.trim();
		if (!apiKey) return;
		try {
			await setAnthropicApiKeyMutation.mutateAsync({ apiKey });
			setAnthropicApiKeyInput("");
			await refetchAnthropicAuthStatus();
			toast.success("Anthropic API key updated");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save");
		}
	};

	const saveOpenAIApiKey = async () => {
		const apiKey = openAIApiKeyInput.trim();
		if (!apiKey) return;
		try {
			await setOpenAIApiKeyMutation.mutateAsync({ apiKey });
			setOpenAIApiKeyInput("");
			await refetchOpenAIAuthStatus();
			toast.success("OpenAI API key updated");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save");
		}
	};

	const renderProviderAction = ({
		status,
		startOAuth,
		isStartingOAuth,
		onDisconnect,
	}: {
		status: typeof anthropicStatus | typeof openAIStatus;
		startOAuth: () => Promise<void>;
		isStartingOAuth: boolean;
		onDisconnect: () => void;
	}) => {
		const action = getProviderAction(status);
		if (!action) return null;
		if (action.kind === "logout") {
			return (
				<Button variant="ghost" size="sm" onClick={onDisconnect}>
					Logout
				</Button>
			);
		}
		return (
			<Button
				size="sm"
				onClick={() => void startOAuth()}
				disabled={isStartingOAuth}
			>
				{action.kind === "reconnect" ? "Reconnect" : "Connect"}
			</Button>
		);
	};

	return (
		<>
			<div className="w-full max-w-4xl p-6">
				<div className="mb-8">
					<h2 className="text-xl font-semibold">Models</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Manage your model accounts, API keys, and provider settings.
					</p>
				</div>

				<div className="space-y-8">
					{showAnthropic ? (
						<SettingsSection
							title="Anthropic"
							icon={<img alt="Claude" className="size-5" src={claudeIcon} />}
						>
							<div className="divide-y divide-border rounded-xl border bg-card">
								<div className="flex items-center justify-between gap-4 px-4 py-3">
									<div className="flex items-center gap-2">
										<p className="text-sm font-semibold">OAuth</p>
										{anthropicBadge ? (
											<Badge variant={anthropicBadge.variant}>
												{anthropicBadge.label}
											</Badge>
										) : null}
									</div>
									{renderProviderAction({
										status: anthropicStatus,
										startOAuth: startAnthropicOAuth,
										isStartingOAuth: isStartingAnthropicOAuth,
										onDisconnect: async () => {
											if (anthropicStatus?.authMethod === "oauth") {
												anthropicOAuthDialog.onDisconnect();
											} else {
												await clearAnthropicApiKeyMutation.mutateAsync();
												setAnthropicApiKeyInput("");
											}
											await refetchAnthropicAuthStatus();
										},
									})}
								</div>
								<ConfigRow
									title="API Key"
									field={
										<Input
											type="password"
											value={anthropicApiKeyInput}
											onChange={(event) => {
												setAnthropicApiKeyInput(event.target.value);
											}}
											placeholder={
												anthropicStatus?.authMethod === "api_key"
													? "Saved Anthropic API key"
													: "sk-ant-..."
											}
											className="font-mono"
											disabled={isSavingAnthropicApiKey}
										/>
									}
									onSave={() => {
										void saveAnthropicApiKey();
									}}
									onClear={() => {
										const nextForm = { ...anthropicForm, apiKey: "" };
										void (async () => {
											try {
												await clearAnthropicApiKeyMutation.mutateAsync();
												setAnthropicApiKeyInput("");
												setAnthropicForm(nextForm);
												await refetchAnthropicAuthStatus();
												toast.success("Anthropic API key cleared");
											} catch (error) {
												toast.error(
													error instanceof Error
														? error.message
														: "Failed to clear",
												);
											}
										})();
									}}
									showSave={anthropicApiKeyInput.trim().length > 0}
									disableSave={isSavingAnthropicApiKey}
									showClear={anthropicStatus?.authMethod === "api_key"}
									disableClear={isSavingAnthropicApiKey}
								/>
							</div>
						</SettingsSection>
					) : null}

					{showOpenAI ? (
						<SettingsSection
							title="OpenAI"
							icon={
								<img
									alt="OpenAI"
									className="size-5 dark:invert"
									src="https://models.dev/logos/openai.svg"
								/>
							}
						>
							<div className="divide-y divide-border rounded-xl border bg-card">
								<div className="flex items-center justify-between gap-4 px-4 py-3">
									<div className="flex items-center gap-2">
										<p className="text-sm font-semibold">OAuth</p>
										{openAIBadge ? (
											<Badge variant={openAIBadge.variant}>
												{openAIBadge.label}
											</Badge>
										) : null}
									</div>
									{renderProviderAction({
										status: openAIStatus,
										startOAuth: startOpenAIOAuth,
										isStartingOAuth: isStartingOpenAIOAuth,
										onDisconnect: async () => {
											if (openAIStatus?.authMethod === "oauth") {
												openAIOAuthDialog.onDisconnect();
											} else {
												await clearOpenAIApiKeyMutation.mutateAsync();
												setOpenAIApiKeyInput("");
											}
											await refetchOpenAIAuthStatus();
										},
									})}
								</div>
								<ConfigRow
									title="API Key"
									field={
										<Input
											type="password"
											value={openAIApiKeyInput}
											onChange={(event) => {
												setOpenAIApiKeyInput(event.target.value);
											}}
											placeholder={
												openAIStatus?.authMethod === "api_key"
													? "Saved OpenAI API key"
													: "sk-..."
											}
											className="font-mono"
											disabled={isSavingOpenAIConfig}
										/>
									}
									onSave={() => {
										void saveOpenAIApiKey();
									}}
									onClear={() => {
										void (async () => {
											try {
												await clearOpenAIApiKeyMutation.mutateAsync();
												setOpenAIApiKeyInput("");
												await refetchOpenAIAuthStatus();
												toast.success("OpenAI API key cleared");
											} catch (error) {
												toast.error(
													error instanceof Error
														? error.message
														: "Failed to clear",
												);
											}
										})();
									}}
									showSave={openAIApiKeyInput.trim().length > 0}
									disableSave={isSavingOpenAIConfig}
									showClear={openAIStatus?.authMethod === "api_key"}
									disableClear={isSavingOpenAIConfig}
								/>
							</div>
						</SettingsSection>
					) : null}

					{showAnthropic ? (
						<Collapsible open={overrideOpen} onOpenChange={setOverrideOpen}>
							<div className="space-y-3">
								<CollapsibleTrigger asChild>
									<button
										type="button"
										className="flex items-center gap-2 text-left text-sm font-semibold"
									>
										<HiChevronDown
											className={`size-4 transition-transform ${overrideOpen ? "" : "-rotate-90"}`}
										/>
										Override Provider
									</button>
								</CollapsibleTrigger>
								<CollapsibleContent>
									<div className="divide-y divide-border rounded-xl border bg-card">
										<ConfigRow
											title="API token"
											description="Anthropic auth token"
											field={
												<Input
													type="password"
													value={anthropicForm.authToken}
													onChange={(event) => {
														setAnthropicForm((current) => ({
															...current,
															authToken: event.target.value,
														}));
													}}
													placeholder="sk-ant-..."
													className="font-mono"
													disabled={isSavingAnthropicConfig}
												/>
											}
											onSave={() => {
												void saveAnthropicForm();
											}}
											onClear={() => {
												const nextForm = { ...anthropicForm, authToken: "" };
												setAnthropicForm(nextForm);
												void saveAnthropicForm(nextForm);
											}}
											disableSave={isSavingAnthropicConfig}
											disableClear={
												isSavingAnthropicConfig ||
												anthropicForm.authToken.length === 0
											}
										/>
										<ConfigRow
											title="Base URL"
											description="Custom API base URL"
											field={
												<Input
													value={anthropicForm.baseUrl}
													onChange={(event) => {
														setAnthropicForm((current) => ({
															...current,
															baseUrl: event.target.value,
														}));
													}}
													placeholder="https://api.anthropic.com"
													className="font-mono"
													disabled={isSavingAnthropicConfig}
												/>
											}
											onSave={() => {
												void saveAnthropicForm();
											}}
											onClear={() => {
												const nextForm = { ...anthropicForm, baseUrl: "" };
												setAnthropicForm(nextForm);
												void saveAnthropicForm(nextForm);
											}}
											disableSave={isSavingAnthropicConfig}
											disableClear={
												isSavingAnthropicConfig ||
												anthropicForm.baseUrl.length === 0
											}
										/>
										<ConfigRow
											title="Additional env"
											description="Extra variables to keep with Anthropic config"
											field={
												<Textarea
													value={anthropicForm.extraEnv}
													onChange={(event) => {
														setAnthropicForm((current) => ({
															...current,
															extraEnv: event.target.value,
														}));
													}}
													placeholder={
														"CLAUDE_CODE_USE_BEDROCK=1\nAWS_REGION=us-east-1"
													}
													className="min-h-24 font-mono text-xs"
													disabled={isSavingAnthropicConfig}
												/>
											}
											onSave={() => {
												void saveAnthropicForm();
											}}
											onClear={
												hasAnthropicConfig
													? () => {
															const nextForm = {
																...anthropicForm,
																extraEnv: "",
															};
															setAnthropicForm(nextForm);
															void saveAnthropicForm(nextForm);
														}
													: undefined
											}
											clearLabel="Clear"
											disableSave={isSavingAnthropicConfig}
											disableClear={
												isSavingAnthropicConfig ||
												anthropicForm.extraEnv.length === 0
											}
										/>
									</div>
								</CollapsibleContent>
							</div>
						</Collapsible>
					) : null}
				</div>
			</div>

			<AnthropicOAuthDialog {...anthropicOAuthDialog} />
			<OpenAIOAuthDialog {...openAIOAuthDialog} />
		</>
	);
}
