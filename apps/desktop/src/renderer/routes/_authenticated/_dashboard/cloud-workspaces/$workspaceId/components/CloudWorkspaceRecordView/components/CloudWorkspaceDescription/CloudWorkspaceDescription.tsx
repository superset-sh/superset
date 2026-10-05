import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { LuRefreshCw } from "react-icons/lu";
import { DescriptionEditor } from "renderer/routes/_authenticated/_dashboard/components/DescriptionEditor";

interface CloudWorkspaceDescriptionProps {
	description: string | null;
	canGenerate: boolean;
	isGenerating: boolean;
	onSave: (description: string | null) => void;
	onGenerate: () => void;
}

export function CloudWorkspaceDescription({
	description,
	canGenerate,
	isGenerating,
	onSave,
	onGenerate,
}: CloudWorkspaceDescriptionProps) {
	return (
		<div>
			<DescriptionEditor
				description={description}
				allowAttachments={false}
				onSave={onSave}
			/>
			{canGenerate && (
				<Button
					variant="ghost"
					size="xs"
					onClick={onGenerate}
					disabled={isGenerating}
					className="mt-3 -ml-2 text-muted-foreground"
				>
					<LuRefreshCw className={cn(isGenerating && "animate-spin")} />
					{isGenerating ? (
						<Trans>Generating…</Trans>
					) : description ? (
						<Trans>Regenerate</Trans>
					) : (
						<Trans>Generate</Trans>
					)}
				</Button>
			)}
		</div>
	);
}
