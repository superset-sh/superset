import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@superset/ui/input-group";
import { Label } from "@superset/ui/label";
import { LuCopy, LuExternalLink } from "react-icons/lu";

interface AnthropicOAuthDialogProps {
	open: boolean;
	authUrl: string | null;
	code: string;
	errorMessage: string | null;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onCodeChange: (value: string) => void;
	onOpenAuthUrl: () => void;
	onCopyAuthUrl: () => void;
	onPasteCode: () => void;
	onSubmit: () => void;
}

export function AnthropicOAuthDialog({
	open,
	authUrl,
	code,
	errorMessage,
	isPending,
	onOpenChange,
	onCodeChange,
	onOpenAuthUrl,
	onCopyAuthUrl,
	onPasteCode,
	onSubmit,
}: AnthropicOAuthDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Connect Anthropic</DialogTitle>
					<DialogDescription>
						Open Anthropic OAuth in your browser, approve access, then paste the
						code here.
					</DialogDescription>
				</DialogHeader>

				<div className="min-w-0 space-y-4">
					<InputGroup className="max-w-full overflow-hidden border-border/70 bg-muted/30">
						<InputGroupInput
							readOnly
							value={authUrl ?? "OAuth URL not ready"}
							className="text-muted-foreground h-9 text-xs"
						/>
						<InputGroupAddon align="inline-end" className="gap-1 pr-1">
							<InputGroupButton
								size="icon-xs"
								variant="ghost"
								aria-label="Copy OAuth URL"
								title="Copy OAuth URL"
								onClick={onCopyAuthUrl}
								disabled={!authUrl}
							>
								<LuCopy className="size-3.5" />
							</InputGroupButton>
							<InputGroupButton
								size="icon-xs"
								variant="ghost"
								aria-label="Open OAuth URL"
								title="Open OAuth URL"
								onClick={onOpenAuthUrl}
								disabled={!authUrl}
							>
								<LuExternalLink className="size-3.5" />
							</InputGroupButton>
						</InputGroupAddon>
					</InputGroup>

					<div className="min-w-0 space-y-2">
						<Label htmlFor="anthropic-oauth-code">Authorization code</Label>
						<InputGroup>
							<InputGroupInput
								id="anthropic-oauth-code"
								placeholder="Paste code#state or callback URL"
								value={code}
								onChange={(event) => onCodeChange(event.target.value)}
								disabled={isPending}
								className="h-11 font-mono"
							/>
							<InputGroupAddon align="inline-end" className="pr-1">
								<InputGroupButton
									size="xs"
									variant="outline"
									onClick={onPasteCode}
									disabled={isPending}
								>
									Paste
								</InputGroupButton>
							</InputGroupAddon>
						</InputGroup>
						<p className="text-muted-foreground text-xs">
							Paste `code#state` from Anthropic (or full callback URL).
						</p>
					</div>

					{errorMessage ? (
						<p className="text-destructive text-sm">{errorMessage}</p>
					) : null}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Back
					</Button>
					<Button
						type="button"
						onClick={onSubmit}
						disabled={isPending || !code}
					>
						{isPending ? "Connecting..." : "Connect"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
