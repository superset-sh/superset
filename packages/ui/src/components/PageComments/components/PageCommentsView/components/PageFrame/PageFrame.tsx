import type { Ref } from "react";

interface PageFrameProps {
	html?: string;
	src?: string;
	title: string;
	ref?: Ref<HTMLIFrameElement>;
	onLoad?: () => void;
}

export function PageFrame({ html, src, title, ref, onLoad }: PageFrameProps) {
	return (
		<iframe
			ref={ref}
			onLoad={onLoad}
			title={title}
			{...(src ? { src } : { srcDoc: html })}
			sandbox="allow-scripts allow-forms allow-popups"
			referrerPolicy="no-referrer"
			allow="fullscreen"
			className="h-full w-full border-0 bg-white"
		/>
	);
}
