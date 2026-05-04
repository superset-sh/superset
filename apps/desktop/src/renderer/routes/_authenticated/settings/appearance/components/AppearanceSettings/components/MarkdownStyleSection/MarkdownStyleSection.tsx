import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import {
	type MarkdownStyle,
	useMarkdownStyle,
	useSetMarkdownStyle,
} from "renderer/stores";

export function MarkdownStyleSection() {
	const markdownStyle = useMarkdownStyle();
	const setMarkdownStyle = useSetMarkdownStyle();

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">Markdown style</h3>
			<p className="text-xs text-muted-foreground mb-3">
				Rendering style for markdown files. Tufte uses elegant serif typography
				inspired by Edward Tufte's books.
			</p>
			<Select
				value={markdownStyle}
				onValueChange={(value) => setMarkdownStyle(value as MarkdownStyle)}
			>
				<SelectTrigger className="w-[200px]" aria-label="Markdown style">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="default">Default</SelectItem>
					<SelectItem value="tufte">Tufte</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
