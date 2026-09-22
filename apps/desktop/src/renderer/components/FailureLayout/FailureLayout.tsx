import type { ReactNode } from "react";
import { failureLayoutStyles } from "./styles";

export function FailureLayout({ children }: { children: ReactNode }) {
	return (
		<div data-desktop-failure-layout style={failureLayoutStyles.frame}>
			<div aria-hidden="true" style={failureLayoutStyles.titleBar} />
			<main style={failureLayoutStyles.content}>{children}</main>
		</div>
	);
}
