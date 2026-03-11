import { chatServiceTrpc } from "@superset/chat/client";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useMemo, useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AnthropicOAuthDialog } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatInterface/components/ModelPicker/components/AnthropicOAuthDialog";
import { OpenAIOAuthDialog } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatInterface/components/ModelPicker/components/OpenAIOAuthDialog";
import { useAnthropicOAuth } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatInterface/components/ModelPicker/hooks/useAnthropicOAuth";
import { useOpenAIOAuth } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatInterface/components/ModelPicker/hooks/useOpenAIOAuth";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { AccountCard } from "./components/AccountCard";
import { ConfigRow } from "./components/ConfigRow";
import { SettingsSection } from "./components/SettingsSection";
import {
	buildAnthropicEnvText,
	EMPTY_ANTHROPIC_FORM,
	getProviderSubtitle,
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
	const [apiKeysOpen, setApiKeysOpen] = useState(true);
	const [overrideOpen, setOverrideOpen] = useState(true);
	const [openAIApiKeyInput, setOpenAIApiKeyInput] = useState("");
	const [anthropicApiKeyInput, setAnthropicApiKeyInput] = useState("");
	const [anthropicForm, setAnthropicForm] = useState(EMPTY_ANTHROPIC_FORM);

	const { data: providerStatuses, refetch: refetchProviderStatuses } =
		electronTrpc.modelProviders.getStatuses.useQuery();
	const anthropicDiagnosticStatus = providerStatuses?.find(
		(status) => status.providerId === "anthropic",
	);
	const openAIDiagnosticStatus = providerStatuses?.find(
		(status) => status.providerId === "openai",
	);
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
	const clearProviderIssueMutation =
		electronTrpc.modelProviders.clearIssue.useMutation();

	const {
		isStartingOAuth: isStartingAnthropicOAuth,
		startAnthropicOAuth,
		oauthDialog: anthropicOAuthDialog,
	} = useAnthropicOAuth({
		...DIALOG_CONTEXT,
		onAuthStateChange: async () => {
			await Promise.all([
				refetchAnthropicAuthStatus(),
				refetchProviderStatuses(),
			]);
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
				diagnosticStatus: anthropicDiagnosticStatus,
			}),
		[anthropicAuthStatus, anthropicDiagnosticStatus],
	);

	const openAIStatus = useMemo(
		() =>
			resolveProviderStatus({
				providerId: "openai",
				authStatus: openAIAuthStatus,
				diagnosticStatus: openAIDiagnosticStatus,
			}),
		[openAIAuthStatus, openAIDiagnosticStatus],
	);

	const anthropicSubtitle = useMemo(
		() => getProviderSubtitle("anthropic", anthropicStatus),
		[anthropicStatus],
	);
	const openAISubtitle = useMemo(
		() => getProviderSubtitle("openai", openAIStatus),
		[openAIStatus],
	);
	const anthropicBadge = useMemo(
		() => getStatusBadge(anthropicStatus),
		[anthropicStatus],
	);
	const openAIBadge = useMemo(
		() => getStatusBadge(openAIStatus),
		[openAIStatus],
	);

	const clearProviderIssue = (providerId: "anthropic" | "openai") =>
		clearProviderIssueMutation.mutateAsync({ providerId });

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
				clearProviderIssue("anthropic"),
				refetchProviderStatuses(),
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
			await Promise.all([
				refetchAnthropicAuthStatus(),
				clearProviderIssue("anthropic"),
				refetchProviderStatuses(),
			]);
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
			await Promise.all([
				refetchOpenAIAuthStatus(),
				clearProviderIssue("openai"),
				refetchProviderStatuses(),
			]);
			toast.success("OpenAI API key updated");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save");
		}
	};

	const renderProviderAction = ({
		status,
		startOAuth,
		isStartingOAuth,
		canDisconnect,
		onDisconnect,
	}: {
		status: typeof anthropicStatus | typeof openAIStatus;
		startOAuth: () => Promise<void>;
		isStartingOAuth: boolean;
		canDisconnect: boolean;
		onDisconnect: () => void;
	}) => {
		if (!status || status.connectionState === "disconnected") {
			return (
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						void startOAuth();
					}}
					disabled={isStartingOAuth}
				>
					Connect
				</Button>
			);
		}

		if (status.issue?.remediation === "reconnect") {
			return (
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						void startOAuth();
					}}
					disabled={isStartingOAuth}
				>
					Reconnect
				</Button>
			);
		}

		if (canDisconnect) {
			return (
				<Button variant="ghost" size="sm" onClick={onDisconnect}>
					Logout
				</Button>
			);
		}

		return (
			<Button
				variant="outline"
				size="sm"
				onClick={() => {
					void startOAuth();
				}}
				disabled={isStartingOAuth}
			>
				Connect
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
						<SettingsSection title="Anthropic Account">
							<AccountCard
								title="Claude"
								subtitle={anthropicSubtitle}
								badge={anthropicBadge?.label}
								badgeVariant={anthropicBadge?.variant}
								muted={anthropicStatus?.connectionState !== "connected"}
								actions={renderProviderAction({
									status: anthropicStatus,
									startOAuth: startAnthropicOAuth,
									isStartingOAuth: isStartingAnthropicOAuth,
									canDisconnect: anthropicOAuthDialog.canDisconnect,
									onDisconnect: anthropicOAuthDialog.onDisconnect,
								})}
							/>
						</SettingsSection>
					) : null}

					{showOpenAI ? (
						<SettingsSection title="Codex Account">
							<AccountCard
								title="ChatGPT"
								subtitle={openAISubtitle}
								badge={openAIBadge?.label}
								badgeVariant={openAIBadge?.variant}
								muted={openAIStatus?.connectionState !== "connected"}
								actions={renderProviderAction({
									status: openAIStatus,
									startOAuth: startOpenAIOAuth,
									isStartingOAuth: isStartingOpenAIOAuth,
									canDisconnect: openAIOAuthDialog.canDisconnect,
									onDisconnect: openAIOAuthDialog.onDisconnect,
								})}
							/>
						</SettingsSection>
					) : null}

					<Collapsible open={apiKeysOpen} onOpenChange={setApiKeysOpen}>
						<div className="space-y-3">
							<CollapsibleTrigger asChild>
								<button
									type="button"
									className="flex items-center gap-2 text-left text-sm font-semibold"
								>
									<HiChevronDown
										className={`size-4 transition-transform ${apiKeysOpen ? "" : "-rotate-90"}`}
									/>
									API Keys
								</button>
							</CollapsibleTrigger>
							<CollapsibleContent className="space-y-3">
								{showAnthropic ? (
									<ConfigRow
										title="Anthropic API Key"
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
													await Promise.all([
														refetchAnthropicAuthStatus(),
														clearProviderIssue("anthropic"),
														refetchProviderStatuses(),
													]);
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
										disableSave={
											isSavingAnthropicApiKey ||
											anthropicApiKeyInput.trim().length === 0
										}
										disableClear={
											isSavingAnthropicApiKey ||
											anthropicStatus?.authMethod !== "api_key"
										}
									/>
								) : null}
								{showOpenAI ? (
									<ConfigRow
										title="OpenAI API Key"
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
													await Promise.all([
														refetchOpenAIAuthStatus(),
														clearProviderIssue("openai"),
														refetchProviderStatuses(),
													]);
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
										disableSave={
											isSavingOpenAIConfig ||
											openAIApiKeyInput.trim().length === 0
										}
										disableClear={
											isSavingOpenAIConfig ||
											openAIStatus?.authMethod !== "api_key"
										}
									/>
								) : null}
							</CollapsibleContent>
						</div>
					</Collapsible>

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
								<CollapsibleContent className="space-y-3">
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
