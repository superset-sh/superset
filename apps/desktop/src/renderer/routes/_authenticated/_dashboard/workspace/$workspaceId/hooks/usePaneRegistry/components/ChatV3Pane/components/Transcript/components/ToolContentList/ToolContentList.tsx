import type { ToolContent } from "@superset/chat/protocol";
import { DiffContent } from "./components/DiffContent";
import { TerminalContent } from "./components/TerminalContent";
import { TextContent } from "./components/TextContent";

export function ToolContentList({
	itemId,
	items,
}: {
	itemId: string;
	items: readonly ToolContent[];
}) {
	return (
		<>
			{items.map((content, index) => {
				const key = `${itemId}:${index}`;
				switch (content.type) {
					case "diff":
						return <DiffContent content={content} key={key} />;
					case "terminal":
						return <TerminalContent content={content} key={key} />;
					case "text":
						return <TextContent key={key} text={content.text} />;
					default:
						return null;
				}
			})}
		</>
	);
}
