"use server";

import { EnterpriseInquiryEmail } from "@superset/email/emails/enterprise-inquiry";
import { headers } from "next/headers";
import { Resend } from "resend";
import { env } from "@/env";

const resend = new Resend(env.RESEND_API_KEY);

// Simple in-memory rate limiter (for production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 3;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Clean up every 5 minutes

// Periodic cleanup to prevent memory leak
setInterval(() => {
	const now = Date.now();
	for (const [ip, record] of rateLimitMap.entries()) {
		if (now > record.resetAt) {
			rateLimitMap.delete(ip);
		}
	}
}, CLEANUP_INTERVAL_MS);

interface EnterpriseFormData {
	name: string;
	role: string;
	company: string;
	email: string;
	phone: string;
	message: string;
	honeypot?: string;
}

function validateEmail(email: string): boolean {
	// Basic email validation - check for @ with text before and after
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

function sanitizeInput(input: string): string {
	// Remove control characters (CR, LF, null bytes) to prevent header injection
	return input.replace(/[\r\n\0]/g, "").trim();
}

function checkRateLimit(ip: string): boolean {
	const now = Date.now();
	const record = rateLimitMap.get(ip);

	if (!record || now > record.resetAt) {
		// New window
		rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
		return true;
	}

	if (record.count >= MAX_REQUESTS_PER_WINDOW) {
		return false;
	}

	record.count++;
	return true;
}

export async function submitEnterpriseInquiry(data: EnterpriseFormData) {
	const { name, role, company, email, phone, message, honeypot } = data;

	// Honeypot check - if filled, silently reject (don't leak that we detected a bot)
	if (honeypot && honeypot.length > 0) {
		return { success: false, error: "Something went wrong. Please try again." };
	}

	// Rate limiting
	const headersList = await headers();
	const forwardedFor = headersList.get("x-forwarded-for");
	// Parse the first IP from x-forwarded-for (format: "client, proxy1, proxy2")
	const ip = forwardedFor
		? (forwardedFor.split(",")[0]?.trim() ?? "unknown")
		: "unknown";

	if (!checkRateLimit(ip)) {
		return {
			success: false,
			error: "Too many requests. Please try again later.",
		};
	}

	// Validate required fields exist
	if (!name || !role || !company || !email) {
		return { success: false, error: "Missing required fields." };
	}

	// Sanitize inputs FIRST to prevent header injection
	const sanitizedName = sanitizeInput(name);
	const sanitizedRole = sanitizeInput(role);
	const sanitizedCompany = sanitizeInput(company);
	const sanitizedEmail = sanitizeInput(email);
	const sanitizedPhone = phone ? sanitizeInput(phone) : "";
	const sanitizedMessage = message ? sanitizeInput(message) : "";

	// Ensure sanitized values are not empty (trimming might have removed everything)
	if (
		!sanitizedName ||
		!sanitizedRole ||
		!sanitizedCompany ||
		!sanitizedEmail
	) {
		return { success: false, error: "Invalid input detected." };
	}

	// Validate email format AFTER sanitization
	if (!validateEmail(sanitizedEmail)) {
		return { success: false, error: "Invalid email address." };
	}

	try {
		const { error } = await resend.emails.send({
			from: "Superset <noreply@superset.sh>",
			to: "founders@superset.sh",
			replyTo: sanitizedEmail,
			subject: `Enterprise inquiry from ${sanitizedName} (${sanitizedCompany})`,
			react: EnterpriseInquiryEmail({
				name: sanitizedName,
				role: sanitizedRole,
				company: sanitizedCompany,
				email: sanitizedEmail,
				phone: sanitizedPhone,
				message: sanitizedMessage,
			}),
		});

		if (error) {
			console.error("Failed to send enterprise inquiry email:", error);
			return {
				success: false,
				error: "Something went wrong. Please try again.",
			};
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to send enterprise inquiry email:", error);
		return { success: false, error: "Something went wrong. Please try again." };
	}
}
