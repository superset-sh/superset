import type { ReactNode } from "react";

export function AccountSlot({
	account,
	before,
	after,
}: {
	account?: ReactNode;
	before?: string;
	after?: string;
}) {
	if (!account) return null;
	return (
		<>
			{before && <Word>{before}</Word>}
			{account}
			{after && <Word>{after}</Word>}
		</>
	);
}

function Word({ children }: { children: ReactNode }) {
	return <span className="text-[13px] text-muted-foreground">{children}</span>;
}
