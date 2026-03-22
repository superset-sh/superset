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

interface OpenAIApiKeyDialogProps {
	open: boolean;
	apiKey: string;
	errorMessage: string | null;
	isPending: boolean;
	canClearApiKey: boolean;
	onOpenChange: (open: boolean) => void;
	onApiKeyChange: (value: string) => void;
	onSubmit: () => void;
	onClear: () => void;
}

export function OpenAIApiKeyDialog({
	open,
	apiKey,
	errorMessage,
	isPending,
	canClearApiKey,
	onOpenChange,
	onApiKeyChange,
	onSubmit,
	onClear,
}: OpenAIApiKeyDialogProps) {
	const errorId = "openai-api-key-error";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Connect OpenAI</DialogTitle>
					<DialogDescription>
						Paste your OpenAI API key to enable GPT, o3, and Codex models in
						chat.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="rounded-lg border border-border/70 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
						API key mode is best if you already manage OpenAI access with a
						standard `sk-...` key.
					</div>

					<div className="space-y-2">
						<Label htmlFor="openai-api-key">API key</Label>
						<InputGroup className="h-11 border-border/70 bg-muted/10">
							<InputGroupInput
								id="openai-api-key"
								type="password"
								placeholder="sk-..."
								value={apiKey}
								onChange={(event) => onApiKeyChange(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && apiKey.trim()) {
										onSubmit();
									}
								}}
								disabled={isPending}
								aria-invalid={Boolean(errorMessage)}
								aria-describedby={errorMessage ? errorId : undefined}
								className="h-11 font-mono"
								autoFocus
							/>
						</InputGroup>
						<p className="text-muted-foreground text-xs">
							Use the same key you would pass as `OPENAI_API_KEY`.
						</p>
					</div>

					{errorMessage ? (
						<p id={errorId} role="alert" className="text-destructive text-sm">
							{errorMessage}
						</p>
					) : null}

					<div className="flex flex-col gap-2 pt-2">
						<Button
							type="button"
							onClick={onSubmit}
							disabled={isPending || apiKey.trim().length === 0}
						>
							{isPending ? "Saving..." : "Save key"}
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
							{canClearApiKey ? (
								<Button
									type="button"
									variant="ghost"
									onClick={onClear}
									disabled={isPending}
								>
									Clear key
								</Button>
							) : null}
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
