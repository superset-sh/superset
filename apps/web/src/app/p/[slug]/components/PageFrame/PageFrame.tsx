interface PageFrameProps {
	html: string;
	title: string;
}

// `srcDoc` because the blob store serves HTML as an attachment under its own
// `default-src 'none'` CSP, so framing the URL directly cannot work.
//
// `allow-same-origin` is deliberately absent: without it the frame gets an
// opaque origin and cannot read this document's cookies, storage, or DOM.
// Adding it would hand user-authored JavaScript a live session, since
// cross-subdomain cookies put ours on every *.superset.sh host.
export function PageFrame({ html, title }: PageFrameProps) {
	return (
		<iframe
			title={title}
			srcDoc={html}
			sandbox="allow-scripts allow-forms allow-popups"
			referrerPolicy="no-referrer"
			allow="fullscreen"
			className="h-full w-full border-0 bg-white"
		/>
	);
}
