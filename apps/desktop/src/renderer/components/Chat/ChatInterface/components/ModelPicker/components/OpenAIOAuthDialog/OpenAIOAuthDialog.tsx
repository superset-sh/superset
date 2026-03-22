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

const OPENAI_OAUTH_CALLBACK_URL = "http://localhost:1455/auth/callback";

interface OpenAIOAuthDialogProps {
	open: boolean;
	authUrl: string | null;
	code: string;
	errorMessage: string | null;
	isPending: boolean;
	canDisconnect: boolean;
	onOpenChange: (open: boolean) => void;
	onCodeChange: (value: string) => void;
	onOpenAuthUrl: () => void;
	onCopyAuthUrl: () => void;
	onDisconnect: () => void;
	onSubmit: () => void;
}

export function OpenAIOAuthDialog({
	open,
	authUrl,
	code,
	errorMessage,
	isPending,
	canDisconnect,
	onOpenChange,
	onCodeChange,
	onOpenAuthUrl,
	onCopyAuthUrl,
	onDisconnect,
	onSubmit,
}: OpenAIOAuthDialogProps) {
	const hasAuthUrl = Boolean(authUrl);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Connect OpenAI</DialogTitle>
					<DialogDescription>
						Approve access in your browser. If the callback does not finish,
						paste the redirected callback URL below.
					</DialogDescription>
				</DialogHeader>

				<div className="min-w-0 space-y-4">
					<div className="rounded-lg border border-border/70 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
						<span className="font-semibold text-foreground">Tip:</span> OpenAI
						OAuth usually completes automatically after browser approval. If you
						land on <code>{`${OPENAI_OAUTH_CALLBACK_URL}?...`}</code>, copy that
						full URL and paste it below.
					</div>

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

					{hasAuthUrl ? (
						<div className="rounded-lg border border-border/70 bg-muted/10 px-4 py-3">
							<p className="text-xs font-medium text-foreground">OAuth URL</p>
							<p className="text-muted-foreground mt-2 break-all font-mono text-xs leading-relaxed">
								{authUrl}
							</p>
						</div>
					) : (
						<div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
							OAuth URL not ready yet.
						</div>
					)}

					<div className="min-w-0 space-y-2">
						<Label htmlFor="openai-oauth-code">Callback URL (optional)</Label>
						<InputGroup className="border-border/70 bg-muted/10">
							<InputGroupInput
								id="openai-oauth-code"
								placeholder={`Paste full ${OPENAI_OAUTH_CALLBACK_URL}?... URL`}
								value={code}
								onChange={(event) => onCodeChange(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !event.nativeEvent.isComposing) {
										onSubmit();
									}
								}}
								disabled={isPending}
								className="h-11 font-mono text-xs sm:text-sm"
								autoFocus
							/>
						</InputGroup>
						<p className="text-muted-foreground text-xs">
							Leave this empty if browser login finishes on its own.
						</p>
					</div>

					{errorMessage ? (
						<p className="text-destructive text-sm">{errorMessage}</p>
					) : null}

					<div className="flex flex-col gap-2 pt-2">
						<Button type="button" onClick={onSubmit} disabled={isPending}>
							{isPending ? "Working..." : "Continue"}
						</Button>
						<div className="flex items-center justify-between gap-2">
							<Button
								type="button"
								variant="ghost"
								onClick={() => onOpenChange(false)}
								disabled={isPending}
							>
								Back
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
