"use server";

import { msg } from "@lingui/core/macro";
import { ContactInquiryEmail } from "@superset/email/emails/internal/contact-inquiry";
import { i18n } from "@superset/i18n";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "@/env";
import { checkEmailFormRateLimit } from "@/lib/email-rate-limit";
import {
	sanitizeMessage,
	sanitizeSingleLine,
	validateEmail,
} from "@/lib/form-utils";

const resend = new Resend(env.RESEND_API_KEY);

const contactFormDataSchema = z.object({
	name: z.string(),
	email: z.string(),
	topic: z.string().optional().default(""),
	message: z.string(),
	honeypot: z.string().optional(),
});

export async function submitContactInquiry(data: unknown) {
	const parsedData = contactFormDataSchema.safeParse(data);
	if (!parsedData.success) {
		return {
			success: false,
			error: i18n._(
				msg({
					message: "Invalid input detected.",
				}),
			),
		};
	}

	const { name, email, topic, message, honeypot } = parsedData.data;

	if (honeypot && honeypot.length > 0) {
		return {
			success: false,
			error: i18n._(
				msg({
					message: "Something went wrong. Please try again.",
				}),
			),
		};
	}

	if (!name || !email || !message) {
		return {
			success: false,
			error: i18n._(
				msg({
					message: "Missing required fields.",
				}),
			),
		};
	}

	const sanitizedName = sanitizeSingleLine(name);
	const sanitizedEmail = sanitizeSingleLine(email);
	const sanitizedTopic = sanitizeSingleLine(topic) || "General question";
	const sanitizedMessage = sanitizeMessage(message);

	if (!sanitizedName || !sanitizedEmail || !sanitizedMessage) {
		return {
			success: false,
			error: i18n._(
				msg({
					message: "Invalid input detected.",
				}),
			),
		};
	}

	if (!validateEmail(sanitizedEmail)) {
		return {
			success: false,
			error: i18n._(
				msg({
					message: "Invalid email address.",
				}),
			),
		};
	}

	try {
		if (!(await checkEmailFormRateLimit(sanitizedEmail))) {
			return {
				success: false,
				error: i18n._(
					msg({
						message: "Too many messages. Please try again later.",
					}),
				),
			};
		}

		const { error } = await resend.emails.send({
			from: "Superset <noreply@superset.sh>",
			to: "support@superset.sh",
			// CC the submitter so they keep a copy and stay on the reply thread.
			cc: sanitizedEmail,
			replyTo: sanitizedEmail,
			subject: `Contact message from ${sanitizedName}: ${sanitizedTopic}`,
			react: ContactInquiryEmail({
				name: sanitizedName,
				email: sanitizedEmail,
				topic: sanitizedTopic,
				message: sanitizedMessage,
			}),
		});

		if (error) {
			console.error("Failed to send contact inquiry email:", error);
			return {
				success: false,
				error: i18n._(
					msg({
						message: "Something went wrong. Please try again.",
					}),
				),
			};
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to send contact inquiry email:", error);
		return {
			success: false,
			error: i18n._(
				msg({
					message: "Something went wrong. Please try again.",
				}),
			),
		};
	}
}
