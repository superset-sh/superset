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
						<div className="min-w-0 space-y-2">
							<Label htmlFor="openai-oauth-code">Callback URL (optional)</Label>
							<InputGroup>
								<InputGroupInput
									id="openai-oauth-code"
									placeholder="Paste callback URL"
									value={code}
									onChange={(event) => onCodeChange(event.target.value)}
									onKeyDown={(event) => {
										if (
											event.key === "Enter" &&
											!event.nativeEvent.isComposing
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
								Leave this empty if browser login finishes on its own.
							</p>
						</div>
					) : (
						<div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
							Preparing OpenAI browser login...
						</div>
					)}

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
