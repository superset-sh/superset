import { createEmailSender } from "@superset/email/sender";

import { env } from "../env";

export const resend = createEmailSender(env);
