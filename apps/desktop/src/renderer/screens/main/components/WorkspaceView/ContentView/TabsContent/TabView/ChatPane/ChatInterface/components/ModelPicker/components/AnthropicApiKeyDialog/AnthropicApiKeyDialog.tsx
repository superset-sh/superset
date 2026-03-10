import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import { Textarea } from "@superset/ui/textarea";

interface AnthropicApiKeyDialogProps {
	open: boolean;
	envText: string;
	errorMessage: string | null;
	isPending: boolean;
	canClearApiKey: boolean;
	onOpenChange: (open: boolean) => void;
	onEnvTextChange: (value: string) => void;
	onSubmit: () => void;
	onClear: () => void;
}

export function AnthropicApiKeyDialog({
	open,
	envText,
	errorMessage,
	isPending,
	canClearApiKey,
	onOpenChange,
	onEnvTextChange,
	onSubmit,
	onClear,
}: AnthropicApiKeyDialogProps) {
	const errorId = "anthropic-api-key-error";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Connect Anthropic</DialogTitle>
				</DialogHeader>

				<div className="space-y-2">
					<Label htmlFor="anthropic-env-block">Environment variables</Label>
					<Textarea
						id="anthropic-env-block"
						value={envText}
						onChange={(event) => onEnvTextChange(event.target.value)}
						placeholder={
							'export ANTHROPIC_API_KEY="sk-ant-api03-local-placeholder"\nexport ANTHROPIC_BASE_URL="http://localhost:29576/vertex/claude"'
						}
						disabled={isPending}
						aria-invalid={Boolean(errorMessage)}
						aria-describedby={errorMessage ? errorId : undefined}
						className="min-h-24 min-w-0 w-full max-w-full max-h-44 field-sizing-fixed resize-y font-mono text-xs"
					/>
					<p className="text-muted-foreground text-xs">
						One per line. Supports `VAR_NAME=value`, `export VAR_NAME=value`,
						and quoted values.
					</p>
				</div>

				{errorMessage ? (
					<p id={errorId} role="alert" className="text-destructive text-sm">
						{errorMessage}
					</p>
				) : null}

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Back
					</Button>
					{canClearApiKey ? (
						<Button
							type="button"
							variant="outline"
							onClick={onClear}
							disabled={isPending}
						>
							Clear settings
						</Button>
					) : null}
					<Button
						type="button"
						onClick={onSubmit}
						disabled={isPending || envText.trim().length === 0}
					>
						{isPending ? "Saving..." : "Save settings"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
