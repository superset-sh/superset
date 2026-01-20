import { Resend } from "resend";

// Env var validated in @superset/auth/env where this is consumed
export const resend = new Resend(process.env.RESEND_API_KEY);
