"use client";

import { useLingui } from "@lingui/react/macro";
import Link from "next/link";

import { Wordmark } from "../Wordmark";
import { OrganizationMenu } from "./components/OrganizationMenu";
import { SidebarNav } from "./components/SidebarNav";

export function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
	const { t } = useLingui();

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-12 shrink-0 items-center px-4">
				<Link
					href="/"
					aria-label={t({ message: "Go to home" })}
					onClick={onNavigate}
				>
					<Wordmark />
				</Link>
			</div>
			<SidebarNav onNavigate={onNavigate} />
			<div className="flex-1" />
			<div className="p-2">
				<OrganizationMenu />
			</div>
		</div>
	);
}
