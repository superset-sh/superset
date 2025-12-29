import type { Components } from "react-markdown";

export interface MarkdownStyleConfig {
	wrapperClass: string;
	articleClass: string;
	components: Partial<Components>;
}
