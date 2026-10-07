import type { MarkdownStyle } from "react-native-enriched-markdown";
import { MESSAGE_MARKDOWN_STYLE } from "@/components/ai-elements/message";

const BODY = { fontSize: 17, lineHeight: 25 };
const INSET = "rgba(255,255,255,0.08)";
const INSET_BORDER = "rgba(255,255,255,0.10)";

export const AGENT_MARKDOWN_STYLE: MarkdownStyle = {
	...MESSAGE_MARKDOWN_STYLE,
	paragraph: {
		...MESSAGE_MARKDOWN_STYLE.paragraph,
		...BODY,
		marginTop: 6,
		marginBottom: 6,
	},
	h1: { ...MESSAGE_MARKDOWN_STYLE.h1, fontSize: 22 },
	h2: { ...MESSAGE_MARKDOWN_STYLE.h2, fontSize: 19 },
	h3: { ...MESSAGE_MARKDOWN_STYLE.h3, fontSize: 18 },
	h4: { ...MESSAGE_MARKDOWN_STYLE.h4, fontSize: 17 },
	h5: { ...MESSAGE_MARKDOWN_STYLE.h5, fontSize: 17 },
	h6: { ...MESSAGE_MARKDOWN_STYLE.h6, fontSize: 17 },
	list: { ...MESSAGE_MARKDOWN_STYLE.list, ...BODY },
	blockquote: {
		...MESSAGE_MARKDOWN_STYLE.blockquote,
		...BODY,
		backgroundColor: "transparent",
		borderColor: "rgba(255,255,255,0.25)",
	},
	code: {
		...MESSAGE_MARKDOWN_STYLE.code,
		fontSize: 16,
		color: "#B4B4B4",
		backgroundColor: "transparent",
		borderColor: "transparent",
	},
	codeBlock: {
		...MESSAGE_MARKDOWN_STYLE.codeBlock,
		fontSize: 14,
		backgroundColor: "#1C1C1C",
		borderColor: INSET_BORDER,
		borderRadius: 10,
		padding: 12,
	},
	table: {
		...MESSAGE_MARKDOWN_STYLE.table,
		fontSize: 15,
		headerBackgroundColor: INSET,
		borderColor: INSET_BORDER,
	},
};
