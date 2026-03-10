import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";

type AuthProvider = "anthropic" | "openai";

interface ProviderAuthMethodDialogProps {
	open: boolean;
	provider: AuthProvider | null;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onSelectApiKey: () => void;
	onSelectOAuth: () => void;
}

export function ProviderAuthMethodDialog({
	open,
	provider,
	isPending,
	onOpenChange,
	onSelectApiKey,
	onSelectOAuth,
}: ProviderAuthMethodDialogProps) {
	const providerName =
		provider === "anthropic"
			? "Anthropic"
			: provider === "openai"
				? "OpenAI"
				: "Provider";
	const description =
		provider === "openai"
			? "Choose how you want to unlock GPT, ChatGPT, and Codex models."
			: "Choose an authentication method.";
	const apiKeyDescription =
		provider === "anthropic"
			? "Paste an API key or env-based Anthropic credentials."
			: "Use an OpenAI API key if you already manage key-based access.";
	const oauthDescription =
		provider === "anthropic"
			? "Sign in via your browser, then paste the callback code if needed."
			: "Sign in with OpenAI in your browser and continue from the callback flow.";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{`Connect ${providerName}`}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="grid gap-2.5">
						<Button
							type="button"
							variant="outline"
							onClick={onSelectApiKey}
							disabled={isPending || !provider}
							className="h-auto w-full flex-col items-start rounded-xl border-border/70 bg-muted/20 px-4 py-4 text-left shadow-none hover:bg-muted/35"
						>
							<span className="text-sm font-medium text-foreground">
								Use API key
							</span>
							<span className="text-muted-foreground text-xs font-normal leading-relaxed">
								{apiKeyDescription}
							</span>
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={onSelectOAuth}
							disabled={isPending || !provider}
							className="h-auto w-full flex-col items-start rounded-xl border-border/70 bg-muted/20 px-4 py-4 text-left shadow-none hover:bg-muted/35"
						>
							<span className="text-sm font-medium text-foreground">
								Use OAuth
							</span>
							<span className="text-muted-foreground text-xs font-normal leading-relaxed">
								{oauthDescription}
							</span>
						</Button>
					</div>
					{provider === "anthropic" ? (
						<div className="rounded-lg border border-border/70 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
							<p className="leading-relaxed">
								<strong className="font-semibold text-foreground">
									Important:
								</strong>{" "}
								Anthropic OAuth in third-party apps may be restricted under
								Anthropic terms; proceed at your own risk. See Anthropic's{" "}
								<a
									className="underline"
									href="https://www.anthropic.com/legal/consumer-terms"
									target="_blank"
									rel="noreferrer"
								>
									Terms of Service
								</a>{" "}
								and{" "}
								<a
									className="underline"
									href="https://code.claude.com/docs/en/legal-and-compliance"
									target="_blank"
									rel="noreferrer"
								>
									Claude Code legal guidance
								</a>{" "}
								before continuing.
							</p>
						</div>
					) : provider === "openai" ? (
						<div className="rounded-lg border border-border/70 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
							<p className="leading-relaxed">
								<strong className="font-semibold text-foreground">Tip:</strong>{" "}
								OAuth usually finishes in the browser. If the callback stalls on
								`localhost`, you can paste that redirected URL into the next
								step manually.
							</p>
						</div>
					) : null}

					<div className="flex justify-end pt-1">
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
							disabled={isPending}
						>
							Close
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
