import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import {
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Copy,
	ExternalLink,
	Eye,
	EyeOff,
	User,
} from "lucide-react";
import { useState } from "react";
import { FaAws } from "react-icons/fa6";
import { SiVercel } from "react-icons/si";

/**
 * Mock of the server-side check a real version runs before saving: one
 * cheap call to the provider with the credential. A rejection keeps the
 * dialog open where it was and says who rejected what.
 */
function mockVerify(ok: boolean, rejection: string): Promise<void> {
	return new Promise((resolve, reject) => {
		window.setTimeout(
			() => (ok ? resolve() : reject(new Error(rejection))),
			700,
		);
	});
}

import type {
	CloudAuthState,
	CustomProvider,
} from "../../cloud-auth-mock-store";

interface CloudAuthDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	presetId: string;
	label: string;
	state: CloudAuthState;
	update: (patch: Partial<CloudAuthState>) => void;
}

const MOCK_TOKEN = "sk-ant-oat01-LDfEQSvxjioImKGD232uMj4pvcOt9s6GnjNBufXzf9Q";
const MOCK_EMAIL = "you@superset.sh";

export function CloudAuthDialog({
	open,
	onOpenChange,
	presetId,
	label,
	state,
	update,
}: CloudAuthDialogProps) {
	const { t } = useLingui();
	const isClaude = presetId === "claude";
	const [view, setView] = useState<"main" | "custom">("main");
	const [revealed, setRevealed] = useState(false);
	const [tokenDraft, setTokenDraft] = useState("");
	const [apiKeyDraft, setApiKeyDraft] = useState("");
	const [apiKeyAdvanced, setApiKeyAdvanced] = useState(false);
	const [checking, setChecking] = useState<string | null>(null);
	const [connecting, setConnecting] = useState(false);

	const verifyAndSave = async (
		id: string,
		ok: boolean,
		rejection: string,
		onOk: () => void,
	) => {
		setChecking(id);
		try {
			await mockVerify(ok, rejection);
			onOk();
			toast.success(t({ message: "Verified and saved" }));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : rejection);
		} finally {
			setChecking(null);
		}
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) setView("main");
		onOpenChange(next);
	};

	const connect = () => {
		setConnecting(true);
		window.setTimeout(() => {
			setConnecting(false);
			update({ method: "subscription", subscriptionConnected: true });
		}, 900);
	};

	const providers: Array<{
		id: CustomProvider;
		label: string;
		icon: React.ReactNode;
		advanced?: boolean;
	}> = isClaude
		? [
				{
					id: "gateway",
					label: t({ message: "Vercel AI Gateway" }),
					icon: <SiVercel className="size-4" />,
				},
				{
					id: "bedrock",
					label: t({ message: "Amazon Bedrock" }),
					icon: <FaAws className="size-4" />,
				},
				{
					id: "manual",
					label: t({ message: "Manual" }),
					icon: <User className="size-4" />,
					advanced: true,
				},
			]
		: [
				{
					id: "manual",
					label: t({ message: "Manual" }),
					icon: <User className="size-4" />,
					advanced: true,
				},
			];
	const customLabel = providers.find(
		(provider) => provider.id === state.customProvider,
	)?.label;

	const optionClass = (selected: boolean) =>
		cn(
			"rounded-lg border border-border px-4 py-3 transition-colors",
			selected && "border-primary/60 bg-primary/[0.04] ring-1 ring-primary/40",
		);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-xl">
				{view === "custom" ? (
					<>
						<DialogHeader>
							<div className="flex items-center gap-2">
								<Button
									aria-label={t({ message: "Back" })}
									className="size-7"
									onClick={() => setView("main")}
									size="icon"
									variant="ghost"
								>
									<ChevronLeft className="size-4" />
								</Button>
								<DialogTitle>
									<Trans>Custom provider</Trans>
								</DialogTitle>
							</div>
							<DialogDescription>
								<Trans>
									Route {label} through a provider you run, with the credentials
									you hold. Saved values are handed to the agent at launch.
								</Trans>
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-2">
							{providers.map((provider) => {
								const expanded = state.customProvider === provider.id;
								const saved = state.customSaved && expanded;
								return (
									<div
										className={cn(
											"rounded-lg border border-border",
											expanded && "border-primary/40",
										)}
										key={provider.id}
									>
										<button
											className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm"
											onClick={() =>
												update({
													customProvider: expanded ? null : provider.id,
												})
											}
											type="button"
										>
											{expanded ? (
												<ChevronDown className="size-4 text-muted-foreground" />
											) : (
												<ChevronRight className="size-4 text-muted-foreground" />
											)}
											<span className="text-muted-foreground">
												{provider.icon}
											</span>
											<span className="font-medium">{provider.label}</span>
											{provider.advanced ? (
												<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
													<Trans>Advanced</Trans>
												</span>
											) : null}
											{saved ? (
												<Check className="ml-auto size-4 text-emerald-500" />
											) : null}
										</button>
										{expanded ? (
											<div className="space-y-3 border-t border-border px-3 py-3">
												<ProviderForm
													checking={checking === provider.id}
													onSave={(ok, rejection) =>
														verifyAndSave(provider.id, ok, rejection, () =>
															update({ method: "custom", customSaved: true }),
														)
													}
													provider={provider.id}
												/>
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>
								<Trans>{label} in cloud workspaces</Trans>
							</DialogTitle>
							<DialogDescription>
								<Trans>
									Pick how {label} signs in inside a sandbox. The credential is
									handed to the agent process when it launches and is not stored
									in the sandbox.
								</Trans>
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-3">
							<RadioGroup
								className="gap-3"
								onValueChange={(value) =>
									update({ method: value as "subscription" | "api_key" })
								}
								value={state.method === "custom" ? "" : state.method}
							>
								{/* Subscription */}
								<div className={optionClass(state.method === "subscription")}>
									<div className="flex items-center gap-3">
										<RadioGroupItem
											id={`${presetId}-sub`}
											value="subscription"
										/>
										<Label
											className="flex flex-1 items-center gap-2 font-medium"
											htmlFor={`${presetId}-sub`}
										>
											<Trans>Subscription</Trans>
											{state.subscriptionConnected ? (
												<Check className="size-4 text-emerald-500" />
											) : null}
										</Label>
										{state.subscriptionConnected ? (
											<Button
												onClick={() => update({ subscriptionConnected: false })}
												size="sm"
												variant="ghost"
											>
												<Trans>Sign out</Trans>
											</Button>
										) : (
											<Button disabled={connecting} onClick={connect} size="sm">
												{connecting ? (
													<Trans>Waiting for browser…</Trans>
												) : isClaude ? (
													<Trans>Sign in with Claude</Trans>
												) : (
													<Trans>Sign in with ChatGPT</Trans>
												)}
											</Button>
										)}
									</div>
									{state.method === "subscription" ? (
										state.subscriptionConnected ? (
											<div className="mt-3 pl-7">
												<p className="text-xs text-muted-foreground">
													<Trans>Signed in as {MOCK_EMAIL}</Trans>
												</p>
												<div className="mt-1.5 flex items-center gap-2">
													<code className="flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
														{revealed
															? MOCK_TOKEN
															: "sk-ant-oat01-••••••••••••••••••••••••••••"}
													</code>
													<Button
														aria-label={
															revealed
																? t({ message: "Hide token" })
																: t({ message: "Show token" })
														}
														className="size-7"
														onClick={() => setRevealed((value) => !value)}
														size="icon"
														variant="ghost"
													>
														{revealed ? (
															<EyeOff className="size-4" />
														) : (
															<Eye className="size-4" />
														)}
													</Button>
												</div>
											</div>
										) : (
											<div className="mt-3 space-y-2 pl-7">
												<p className="text-xs text-muted-foreground">
													{isClaude ? (
														<Trans>
															Sign in with your Claude account, or run{" "}
															<code className="rounded bg-muted px-1 py-0.5 font-mono">
																claude setup-token
															</code>
															<button
																aria-label={t({ message: "Copy command" })}
																className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
																type="button"
															>
																<Copy className="size-3.5" />
															</button>{" "}
															in a terminal and paste the token here.
														</Trans>
													) : (
														<Trans>
															Signs in the way the Codex CLI does. Or run{" "}
															<code className="rounded bg-muted px-1 py-0.5 font-mono">
																codex login
															</code>{" "}
															in a terminal and paste its token here.
														</Trans>
													)}
												</p>
												<div className="flex items-center gap-2">
													<Input
														autoComplete="off"
														className="font-mono text-sm"
														onChange={(e) => setTokenDraft(e.target.value)}
														placeholder={
															isClaude
																? "CLAUDE_CODE_OAUTH_TOKEN"
																: "CODEX_ACCESS_TOKEN"
														}
														type="password"
														value={tokenDraft}
													/>
													<Button
														disabled={!tokenDraft.trim()}
														onClick={() => {
															update({ subscriptionConnected: true });
															setTokenDraft("");
														}}
														size="sm"
														variant="outline"
													>
														<Trans>Save</Trans>
													</Button>
												</div>
											</div>
										)
									) : null}
								</div>

								{/* API key */}
								<div className={optionClass(state.method === "api_key")}>
									<div className="flex items-center gap-3">
										<RadioGroupItem id={`${presetId}-key`} value="api_key" />
										<Label
											className="flex flex-1 items-center gap-2 font-medium"
											htmlFor={`${presetId}-key`}
										>
											<Trans>API key</Trans>
											{state.apiKeySaved ? (
												<Check className="size-4 text-emerald-500" />
											) : null}
										</Label>
										<a
											className="inline-flex items-center gap-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
											href={
												isClaude
													? "https://console.anthropic.com/settings/keys"
													: "https://platform.openai.com/api-keys"
											}
											rel="noreferrer"
											target="_blank"
										>
											<Trans>Get key</Trans>
											<ExternalLink className="size-3.5" />
										</a>
									</div>
									{state.method === "api_key" ? (
										<div className="mt-3 space-y-2 pl-7">
											<button
												className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
												onClick={() => setApiKeyAdvanced((value) => !value)}
												type="button"
											>
												{apiKeyAdvanced ? (
													<ChevronDown className="size-4" />
												) : (
													<ChevronRight className="size-4" />
												)}
												<Trans>Advanced</Trans>
											</button>
											{apiKeyAdvanced ? (
												<Field
													label={t({ message: "Base URL" })}
													placeholder={
														isClaude
															? "https://api.anthropic.com"
															: "https://api.openai.com/v1"
													}
												/>
											) : null}
											<div className="flex items-center gap-2">
												<Input
													autoComplete="off"
													className="font-mono text-sm"
													onChange={(e) => setApiKeyDraft(e.target.value)}
													placeholder={
														state.apiKeySaved
															? "••••••••••••••••"
															: isClaude
																? "ANTHROPIC_API_KEY"
																: "OPENAI_API_KEY"
													}
													type="password"
													value={apiKeyDraft}
												/>
												<Button
													disabled={
														!apiKeyDraft.trim() || checking === "api_key"
													}
													onClick={() =>
														verifyAndSave(
															"api_key",
															apiKeyDraft.startsWith(
																isClaude ? "sk-ant-" : "sk-",
															),
															isClaude
																? t({
																		message: "Anthropic rejected this API key.",
																	})
																: t({
																		message: "OpenAI rejected this API key.",
																	}),
															() => {
																update({ apiKeySaved: true });
																setApiKeyDraft("");
															},
														)
													}
													size="sm"
												>
													{checking === "api_key" ? (
														<Trans>Checking…</Trans>
													) : (
														<Trans>Save</Trans>
													)}
												</Button>
											</div>
										</div>
									) : null}
								</div>
							</RadioGroup>

							{/* Custom provider: a nested view, not a radio */}
							<button
								className={cn(
									optionClass(state.method === "custom"),
									"flex w-full items-center gap-3 text-left",
								)}
								onClick={() => setView("custom")}
								type="button"
							>
								<span className="flex-1 font-medium">
									<Trans>Custom provider</Trans>
									{state.method === "custom" && customLabel ? (
										<span className="ml-2 text-sm font-normal text-muted-foreground">
											{customLabel}
										</span>
									) : null}
								</span>
								{state.method === "custom" && state.customSaved ? (
									<Check className="size-4 text-emerald-500" />
								) : null}
								<ChevronRight className="size-4 text-muted-foreground" />
							</button>
						</div>
					</>
				)}

				<DialogFooter>
					<Button onClick={() => handleOpenChange(false)} variant="outline">
						<Trans>Done</Trans>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function SecretField({
	placeholder,
	label,
	value,
	onChange,
}: {
	placeholder: string;
	label?: string;
	value?: string;
	onChange?: (value: string) => void;
}) {
	const { t } = useLingui();
	const [shown, setShown] = useState(false);
	return (
		<div className="space-y-1.5">
			{label ? <Label className="text-sm font-medium">{label}</Label> : null}
			<div className="relative">
				<Input
					autoComplete="off"
					className="pr-9 font-mono text-sm"
					onChange={(e) => onChange?.(e.target.value)}
					placeholder={placeholder}
					type={shown ? "text" : "password"}
					value={value}
				/>
				<button
					aria-label={shown ? t({ message: "Hide" }) : t({ message: "Show" })}
					className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					onClick={() => setShown((value) => !value)}
					type="button"
				>
					{shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
				</button>
			</div>
		</div>
	);
}

function Field({
	label,
	placeholder,
}: {
	label: string;
	placeholder?: string;
}) {
	return (
		<div className="space-y-1.5">
			<Label className="text-sm font-medium">{label}</Label>
			<Input
				autoComplete="off"
				className="font-mono text-sm"
				placeholder={placeholder}
			/>
		</div>
	);
}

function ProviderForm({
	provider,
	onSave,
	checking,
}: {
	provider: CustomProvider;
	onSave: (ok: boolean, rejection: string) => void;
	checking: boolean;
}) {
	const { t } = useLingui();
	const [draft, setDraft] = useState("");
	const filled = draft.trim().length > 0;
	if (provider === "gateway") {
		return (
			<>
				<a
					className="inline-flex items-center gap-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
					href="https://vercel.com/ai-gateway"
					rel="noreferrer"
					target="_blank"
				>
					<Trans>Get an API key</Trans>
					<ExternalLink className="size-3.5" />
				</a>
				<div className="flex items-center gap-2">
					<div className="flex-1">
						<SecretField
							onChange={setDraft}
							placeholder="AI_GATEWAY_API_KEY"
							value={draft}
						/>
					</div>
					<Button
						disabled={checking}
						onClick={() =>
							onSave(
								filled,
								t({ message: "Vercel AI Gateway rejected this key." }),
							)
						}
						size="sm"
					>
						{checking ? <Trans>Checking…</Trans> : <Trans>Save</Trans>}
					</Button>
				</div>
			</>
		);
	}
	if (provider === "bedrock") {
		return (
			<>
				<RadioGroup className="flex items-center gap-5" defaultValue="aws">
					<div className="flex items-center gap-2">
						<RadioGroupItem id="bedrock-aws" value="aws" />
						<Label className="font-normal" htmlFor="bedrock-aws">
							<Trans>AWS access keys</Trans>
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<RadioGroupItem id="bedrock-key" value="key" />
						<Label className="font-normal" htmlFor="bedrock-key">
							<Trans>Bedrock API key</Trans>
						</Label>
					</div>
				</RadioGroup>
				<SecretField
					label={t({ message: "Access key ID" })}
					onChange={setDraft}
					placeholder="AKIA…"
					value={draft}
				/>
				<SecretField
					label={t({ message: "Secret access key" })}
					placeholder=""
				/>
				<SecretField
					label={t({ message: "Session token (optional)" })}
					placeholder=""
				/>
				<Field label={t({ message: "Region" })} placeholder="us-east-1" />
				<Field
					label={t({ message: "Test model" })}
					placeholder="us.anthropic.claude-sonnet-4-6"
				/>
				<Button
					disabled={checking}
					onClick={() =>
						onSave(
							filled,
							t({ message: "Bedrock rejected these credentials." }),
						)
					}
					size="sm"
				>
					{checking ? <Trans>Testing…</Trans> : <Trans>Test and save</Trans>}
				</Button>
			</>
		);
	}
	return (
		<>
			<p className="text-xs text-muted-foreground">
				<Trans>
					Environment variables handed to the agent as-is, one per line. Use
					this for a self-hosted proxy or anything the presets do not cover.
				</Trans>
			</p>
			<textarea
				className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
				onChange={(e) => setDraft(e.target.value)}
				placeholder={"ANTHROPIC_BASE_URL=https://…\nANTHROPIC_AUTH_TOKEN=…"}
				value={draft}
			/>
			<Button
				disabled={checking}
				onClick={() =>
					onSave(
						filled,
						t({ message: "The endpoint rejected these variables." }),
					)
				}
				size="sm"
			>
				{checking ? <Trans>Testing…</Trans> : <Trans>Save</Trans>}
			</Button>
		</>
	);
}
