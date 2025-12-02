import { cn } from "@superset/ui/utils";
import { OpenInButton } from "renderer/components/OpenInButton";
import { CONFIG_FILE_NAME, CONFIG_TEMPLATE, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";

export interface ConfigFilePreviewProps {
	projectName: string;
	configFilePath?: string;
	className?: string;
}

export function ConfigFilePreview({
	projectName,
	configFilePath,
	className,
}: ConfigFilePreviewProps) {
	return (
		<div className={cn("rounded-lg border border-border bg-card overflow-hidden", className)}>
			<div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border">
				<span className="text-sm text-muted-foreground font-mono truncate">
					{projectName}/{PROJECT_SUPERSET_DIR_NAME}/{CONFIG_FILE_NAME}
				</span>
				<OpenInButton path={configFilePath} label={CONFIG_FILE_NAME} />
			</div>

			<div className="p-4 bg-background/50">
				<pre className="text-sm font-mono text-foreground leading-relaxed">
					{CONFIG_TEMPLATE}
				</pre>
			</div>
		</div>
	);
}

