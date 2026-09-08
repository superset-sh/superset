"use client";

import { useLingui } from "@lingui/react/macro";

// Series keys arrive from the server as stable identifiers; the labels people
// read are translated here so the router stays free of copy.
export function useGrowthLabels() {
	const { t } = useLingui();

	const channel: Record<string, string> = {
		organic_search: t({ message: "Organic search" }),
		direct: t({ message: "Direct" }),
		social: t({ message: "Social" }),
		referral: t({ message: "Referral" }),
		ai: t({ message: "AI assistants" }),
		email: t({ message: "Email" }),
		video: t({ message: "Video" }),
		paid_search: t({ message: "Paid search" }),
		other: t({ message: "Other" }),
	};

	const section: Record<string, string> = {
		home: t({ message: "Home" }),
		compare: t({ message: "Compare" }),
		docs: t({ message: "Docs" }),
		blog: t({ message: "Blog" }),
		changelog: t({ message: "Changelog" }),
		other: t({ message: "Other" }),
	};

	const labelFor = (map: Record<string, string>) => (key: string) =>
		map[key] ?? key;

	return { channel: labelFor(channel), section: labelFor(section) };
}
