import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** A query-string value as state, so a view can be linked from Slack or a digest. */
export function useSearchParamState(name: string) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const setValue = useCallback(
		(value: string | null) => {
			const next = new URLSearchParams(window.location.search);
			if (value) next.set(name, value);
			else next.delete(name);
			const query = next.toString();
			router.replace(query ? `${pathname}?${query}` : pathname, {
				scroll: false,
			});
		},
		[name, pathname, router],
	);

	return [searchParams.get(name), setValue] as const;
}
