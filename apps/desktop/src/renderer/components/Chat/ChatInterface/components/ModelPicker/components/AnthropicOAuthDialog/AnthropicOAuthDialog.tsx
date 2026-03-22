import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { InputGroup, InputGroupInput } from "@superset/ui/input-group";
import { Label } from "@superset/ui/label";

interface AnthropicOAuthDialogProps {
	open: boolean;
	authUrl: string | null;
	code: string;
	errorMessage: string | null;
	isPreparing: boolean;
	isPending: boolean;
	canDisconnect: boolean;
	onOpenChange: (open: boolean) => void;
	onCodeChange: (value: string) => void;
	onOpenAuthUrl: () => void;
	onCopyAuthUrl: () => void;
	onDisconnect: () => void;
	onRetry: () => void;
	onSubmit: () => void;
}

export function AnthropicOAuthDialog({
	open,
	authUrl,
	code,
	errorMessage,
	isPreparing,
	isPending,
	canDisconnect,
	onOpenChange,
	onCodeChange,
	onOpenAuthUrl,
	onCopyAuthUrl,
	onDisconnect,
	onRetry,
	onSubmit,
}: AnthropicOAuthDialogProps) {
	const hasAuthUrl = Boolean(authUrl);
	const showCodeInput = hasAuthUrl || isPending;
	const primaryLabel = isPending
		? "Connecting..."
		: hasAuthUrl
			? "Continue"
			: "Try again";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Connect Anthropic</DialogTitle>
					<DialogDescription>
						Approve access in your browser, then paste the callback URL or
						`code#state` here.
					</DialogDescription>
				</DialogHeader>

				<div className="min-w-0 space-y-4">
					{isPreparing ? (
						<div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
							Preparing Anthropic browser login...
						</div>
					) : null}

					{showCodeInput ? (
						<div className="min-w-0 space-y-3">
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={onOpenAuthUrl}
									disabled={!authUrl || isPending}
								>
									Open browser again
								</Button>
								<Button
									type="button"
									variant="ghost"
									onClick={onCopyAuthUrl}
									disabled={!authUrl || isPending}
								>
									Copy URL
								</Button>
							</div>

							<div className="min-w-0 space-y-2">
								<Label htmlFor="anthropic-oauth-code">Authorization code</Label>
								<InputGroup>
									<InputGroupInput
										id="anthropic-oauth-code"
										placeholder="Paste callback URL or code#state"
										value={code}
										onChange={(event) => onCodeChange(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter" && code.trim()) {
												onSubmit();
											}
										}}
										disabled={isPending}
										className="h-11 font-mono"
										autoFocus
									/>
								</InputGroup>
								<p className="text-muted-foreground text-xs">
									Anthropic usually returns a full callback URL. Pasting either
									format works.
								</p>
							</div>
						</div>
					) : null}

					{errorMessage ? (
						<p className="text-destructive text-sm">{errorMessage}</p>
					) : null}

					<div className="flex flex-col gap-2 pt-2">
						<Button
							type="button"
							onClick={hasAuthUrl ? onSubmit : onRetry}
							disabled={
								isPreparing || isPending || (hasAuthUrl && !code.trim())
							}
						>
							{primaryLabel}
						</Button>
						<div className="flex items-center justify-between gap-2">
							<Button
								type="button"
								variant="ghost"
								onClick={() => onOpenChange(false)}
								disabled={isPending}
							>
								Cancel
							</Button>
							{canDisconnect ? (
								<Button
									type="button"
									variant="ghost"
									onClick={onDisconnect}
									disabled={isPending}
								>
									Disconnect
								</Button>
							) : null}
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
