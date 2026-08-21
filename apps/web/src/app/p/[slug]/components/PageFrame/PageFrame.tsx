interface PageFrameProps {
	html: string;
	title: string;
}

/**
 * A published page, rendered in isolation from the app around it.
 *
 * `srcDoc` rather than `src`, because the blob store cannot serve a renderable
 * page: Vercel stamps `content-disposition: attachment` on HTML (so a browser
 * downloads it instead of rendering) and its own `default-src 'none'` CSP (so
 * nothing would run anyway). Neither is configurable — `put()` accepts no
 * disposition option. So the bytes are fetched server-side and inlined here.
 *
 * `allow-same-origin` is deliberately absent, and that is what makes this safe:
 * without it the frame gets an *opaque* origin, so the page cannot read this
 * document's cookies, storage, or DOM. Adding it would hand user-authored
 * JavaScript a live session, since cross-subdomain cookies put ours on every
 * *.superset.sh host. Scripts still run; what is lost is storage and
 * credentialed fetch.
 *
 * Note that a srcdoc frame inherits this page's CSP, so a published page is
 * bound by app.superset.sh's policy. Serving from a user-content domain of our
 * own is what would lift that, and is the reason to get one.
 */
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
