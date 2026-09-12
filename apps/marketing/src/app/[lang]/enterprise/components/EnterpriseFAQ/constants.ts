import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface EnterpriseFAQItem {
	id: string;
	question: MessageDescriptor;
	answer: MessageDescriptor;
}

export const ENTERPRISE_FAQ_ITEMS: EnterpriseFAQItem[] = [
	{
		id: "whatIsEnterprise",
		question: msg({
			message: "What is Superset Enterprise?",
		}),
		answer: msg({
			message:
				"Superset Enterprise is Superset for teams. Reach out to learn more about what's included and how it can work for your organization.",
		}),
	},
	{
		id: "getStarted",
		question: msg({
			message: "How do I get started?",
		}),
		answer: msg({
			message:
				"Fill out the contact form on this page and our team will reach out to learn about your needs and walk you through next steps.",
		}),
	},
	{
		id: "pricing",
		question: msg({
			message: "How does pricing work?",
		}),
		answer: msg({
			message:
				"Pricing depends on your team and use case. Get in touch and we'll put together a plan that works for you.",
		}),
	},
	{
		id: "dataSecurity",
		question: msg({
			message: "Is my data secure?",
		}),
		answer: msg({
			message:
				"Superset runs locally on your developers' machines. We don't store your code or AI conversations, and Superset has completed a SOC 2 Type II audit with an independent auditor. Request the report and review our security documentation at trust.superset.sh.",
		}),
	},
];
