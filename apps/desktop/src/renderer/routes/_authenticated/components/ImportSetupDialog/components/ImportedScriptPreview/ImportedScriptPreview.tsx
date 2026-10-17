import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import type { SetupImportCandidate } from "renderer/hooks/host-service/useSetupImportCandidates";
import { CodeBlock } from "./components/CodeBlock";

type ScriptKey = "setup" | "teardown" | "run";
type ScriptPlan = NonNullable<SetupImportCandidate["scripts"][ScriptKey]>;
type Conflict = SetupImportCandidate["conflicts"][number];

interface ImportedScriptPreviewProps {
	scriptKey: ScriptKey;
	plan: ScriptPlan;
	conflict?: Conflict;
}

export function ImportedScriptPreview({
	scriptKey,
	plan,
	conflict,
}: ImportedScriptPreviewProps) {
	const { t } = useLingui();
	const title = {
		setup: t`Setup`,
		teardown: t`Teardown`,
		run: t`Run`,
	}[scriptKey];
	const scriptPath = plan.scriptFile?.path;
	const currentScriptFile = conflict?.currentScriptFile;
	const overwritesScript =
		!!currentScriptFile && currentScriptFile === scriptPath;
	const removesScript = !!conflict?.removesScriptFile;
	const shadowsScript =
		!!currentScriptFile &&
		!scriptPath &&
		!removesScript &&
		conflict?.current.length === 0;

	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-2">
				<p className="text-sm font-medium">{title}</p>
				{conflict && (
					<Badge variant="outline" className="text-[10px]">
						<Trans>Replaces current commands</Trans>
					</Badge>
				)}
			</div>

			{conflict && (
				<div className="space-y-1">
					<p className="text-xs text-muted-foreground">
						<Trans>Current</Trans>
					</p>
					{conflict.current.length > 0 && (
						<CodeBlock>{conflict.current.join("\n")}</CodeBlock>
					)}
					{overwritesScript && (
						<p className="text-xs text-muted-foreground">
							<Trans>
								Overwrites{" "}
								<code className="font-mono">{currentScriptFile}</code>
							</Trans>
						</p>
					)}
					{removesScript && (
						<p className="text-xs text-muted-foreground">
							<Trans>
								Deletes <code className="font-mono">{currentScriptFile}</code>,
								which an earlier import created
							</Trans>
						</p>
					)}
					{shadowsScript && (
						<p className="text-xs text-muted-foreground">
							<Trans>
								Runs instead of{" "}
								<code className="font-mono">{currentScriptFile}</code>, which
								runs today
							</Trans>
						</p>
					)}
					<p className="pt-1 text-xs text-muted-foreground">
						<Trans context="heading over the commands an import would write, below the current ones">
							Imported
						</Trans>
					</p>
				</div>
			)}

			<CodeBlock>{plan.commands.join("\n")}</CodeBlock>

			{plan.scriptFile && scriptPath && (
				<div className="space-y-1">
					<p className="text-xs text-muted-foreground">
						<Trans>
							This script has shell blocks that do not split into separate
							commands, so it is saved to{" "}
							<code className="font-mono">{scriptPath}</code>:
						</Trans>
					</p>
					<CodeBlock>{plan.scriptFile.content}</CodeBlock>
				</div>
			)}
		</div>
	);
}
