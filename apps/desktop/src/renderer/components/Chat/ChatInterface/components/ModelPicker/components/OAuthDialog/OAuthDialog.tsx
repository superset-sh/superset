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
import { useCallback, useState } from "react";

export interface OAuthDialogProps {
	provider: {
		title: string;
		description: string;
		codeLabel: string;
		codePlaceholder: string;
		codeHint: string;
		preparingLabel: string;
	};
	open: boolean;
	authUrl: string | null;
	code: string;
	errorMessage: string | null;
	isPreparing?: boolean;
	isPending: boolean;
	canDisconnect: boolean;
	requireCodeForSubmit?: boolean;
	onOpenChange: (open: boolean) => void;
	onCodeChange: (value: string) => void;
	onOpenAuthUrl: () => void;
	onCopyAuthUrl: () => void;
	onDisconnect: () => void;
	onRetry?: () => void;
	onSubmit: () => void;
}

export function OAuthDialog({
	provider,
	open,
	authUrl,
	code,
	errorMessage,
	isPreparing,
	isPending,
	canDisconnect,
	requireCodeForSubmit,
	onOpenChange,
	onCodeChange,
	onOpenAuthUrl,
	onCopyAuthUrl,
	onDisconnect,
	onRetry,
	onSubmit,
}: OAuthDialogProps) {
	const hasAuthUrl = Boolean(authUrl);
	const showCodeInput = hasAuthUrl || isPending;
	const canSubmit =
		!isPreparing &&
		!isPending &&
		(!requireCodeForSubmit || code.trim().length > 0);
	const [copied, setCopied] = useState(false);
	const handleCopy = useCallback(() => {
		onCopyAuthUrl();
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [onCopyAuthUrl]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{provider.title}</DialogTitle>
					<DialogDescription>{provider.description}</DialogDescription>
				</DialogHeader>

				<div className="min-w-0 space-y-4">
					{isPreparing ? (
						<div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
							{provider.preparingLabel}
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
									onClick={handleCopy}
									disabled={!authUrl || isPending}
								>
									{copied ? "Copied!" : "Copy URL"}
								</Button>
							</div>

							<div className="min-w-0 space-y-2">
								<Label htmlFor="oauth-code">{provider.codeLabel}</Label>
								<InputGroup>
									<InputGroupInput
										id="oauth-code"
										placeholder={provider.codePlaceholder}
										value={code}
										onChange={(event) => onCodeChange(event.target.value)}
										onKeyDown={(event) => {
											if (
												event.key === "Enter" &&
												!event.nativeEvent.isComposing &&
												canSubmit
											) {
												onSubmit();
											}
										}}
										disabled={isPending}
										className="h-11 font-mono text-sm"
										autoFocus
									/>
								</InputGroup>
								<p className="text-muted-foreground text-xs">
									{provider.codeHint}
								</p>
							</div>
						</div>
					) : !isPreparing ? (
						<div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
							{provider.preparingLabel}
						</div>
					) : null}

					{errorMessage ? (
						<p className="text-destructive text-sm">{errorMessage}</p>
					) : null}

					<div className="flex flex-col gap-2 pt-2">
						<Button
							type="button"
							onClick={hasAuthUrl ? onSubmit : (onRetry ?? onSubmit)}
							disabled={!canSubmit}
						>
							{isPending
								? "Connecting..."
								: hasAuthUrl
									? "Continue"
									: "Try again"}
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
