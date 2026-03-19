import { MessageResponse } from "@superset/ui/ai-elements/message";
import { Switch } from "@superset/ui/switch";

interface MarkdownToggleContentProps {
	toggleId: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	content: string;
	labelClassName?: string;
	markdownContainerClassName?: string;
	plainContainerClassName?: string;
}

export function MarkdownToggleContent({
	toggleId,
	checked,
	onCheckedChange,
	content,
	labelClassName = "flex cursor-pointer items-center gap-2 text-muted-foreground",
	markdownContainerClassName = "max-h-64 overflow-auto rounded border bg-background/80 p-2",
	plainContainerClassName = "max-h-64 overflow-auto rounded border bg-background/80 p-2 text-xs whitespace-pre-wrap break-words",
}: MarkdownToggleContentProps) {
	return (
		<>
			<label htmlFor={toggleId} className={labelClassName}>
				<Switch
					id={toggleId}
					checked={checked}
					onCheckedChange={onCheckedChange}
				/>
				Render markdown
			</label>
			{checked ? (
				<div className={markdownContainerClassName}>
					<MessageResponse
						animated={false}
						isAnimating={false}
						mermaid={{
							config: {
								theme: "default",
							},
						}}
					>
						{content}
					</MessageResponse>
				</div>
			) : (
				<pre className={plainContainerClassName}>{content}</pre>
			)}
		</>
	);
}
