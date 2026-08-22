import {
	type NavigateOptions,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/**
 * Loop-proof declarative redirect. TanStack's <Navigate> re-navigates
 * whenever its props OBJECT IDENTITY changes, so an inline element
 * re-navigates on every parent re-render until React throws error #185
 * (#5729, SUPER-1814). This keys off the resolved target href instead:
 * one navigation per distinct destination, safe to render inline with
 * dynamic params/search. Prefer `beforeLoad: () => { throw redirect(...) }`
 * when the target is static — that avoids render-time navigation entirely.
 */
export function Redirect(props: NavigateOptions) {
	const router = useRouter();
	const navigate = useNavigate();
	const href = router.buildLocation(props).href;
	const propsRef = useRef(props);
	propsRef.current = props;
	const lastHrefRef = useRef<string | null>(null);

	useEffect(() => {
		if (lastHrefRef.current === href) return;
		navigate(propsRef.current).catch((error) => {
			// A route-load/guard failure would otherwise be an unhandled
			// rejection. Clear the marker so a later render can retry the
			// same target rather than treating it as permanently done.
			lastHrefRef.current = null;
			console.error("[Redirect] navigation failed", { href, error });
		});
		lastHrefRef.current = href;
	}, [href, navigate]);

	return null;
}
