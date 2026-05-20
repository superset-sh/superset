"use server";

import { ContactInquiryEmail } from "@superset/email/emails/contact-inquiry";
import { Resend } from "resend";
import { env } from "@/env";

const resend = new Resend(env.RESEND_API_KEY);

interface ContactFormData {
	name: string;
	email: string;
	topic: string;
	message: string;
	honeypot?: string;
}

function validateEmail(email: string): boolean {
	const parts = email.split("@");
	return (
		parts.length === 2 &&
		parts[0] !== undefined &&
		parts[0].length > 0 &&
		parts[1] !== undefined &&
		parts[1].length > 0 &&
		parts[1].includes(".")
	);
}

function sanitizeSingleLine(input: string): string {
	return input.replace(/[\r\n\0]/g, "").trim();
}

function sanitizeMessage(input: string): string {
	return input.replace(/\0/g, "").trim();
}

export async function submitContactInquiry(data: ContactFormData) {
	const { name, email, topic, message, honeypot } = data;

	if (honeypot && honeypot.length > 0) {
		return { success: false, error: "Something went wrong. Please try again." };
	}

	if (!name || !email || !message) {
		return { success: false, error: "Missing required fields." };
	}

	const sanitizedName = sanitizeSingleLine(name);
	const sanitizedEmail = sanitizeSingleLine(email);
	const sanitizedTopic = topic ? sanitizeSingleLine(topic) : "General question";
	const sanitizedMessage = sanitizeMessage(message);

	if (!sanitizedName || !sanitizedEmail || !sanitizedMessage) {
		return { success: false, error: "Invalid input detected." };
	}

	if (!validateEmail(sanitizedEmail)) {
		return { success: false, error: "Invalid email address." };
	}

	try {
		const { error } = await resend.emails.send({
			from: "Superset <noreply@superset.sh>",
			to: "founders@superset.sh",
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
				error: "Something went wrong. Please try again.",
			};
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to send contact inquiry email:", error);
		return { success: false, error: "Something went wrong. Please try again." };
	}
}
