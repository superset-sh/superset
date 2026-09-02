import { Trans, useLingui } from "@lingui/react/macro";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import {
	type MarkdownStyle,
	useMarkdownStyle,
	useSetMarkdownStyle,
} from "renderer/stores";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function MarkdownStyleSection() {
	const { t } = useLingui();
	const markdownStyle = useMarkdownStyle();
	const setMarkdownStyle = useSetMarkdownStyle();
	const searchQuery = useSettingsSearchQuery();

	return (
		<div className="flex items-center justify-between gap-6 p-4">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">
					<HighlightText
						text={t({
							message: "Markdown style",
						})}
						query={searchQuery}
					/>
				</div>
				<div className="text-xs text-muted-foreground">
					<HighlightText
						text={t({
							message:
								"Rendering style for markdown files. Tufte uses elegant serif typography inspired by Edward Tufte's books.",
						})}
						query={searchQuery}
					/>
				</div>
			</div>
			<Select
				value={markdownStyle}
				onValueChange={(value) => setMarkdownStyle(value as MarkdownStyle)}
			>
				<SelectTrigger
					size="sm"
					className="w-auto min-w-44 px-2"
					aria-label={t({
						message: "Markdown style",
					})}
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="default">
						<Trans>Default</Trans>
					</SelectItem>
					<SelectItem value="tufte">
						<Trans>Tufte</Trans>
					</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
