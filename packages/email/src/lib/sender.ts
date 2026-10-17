import { COMPANY } from "@superset/shared/constants";
import { env } from "./env";

export const NOREPLY_FROM = `${COMPANY.NAME} <noreply@${env.EMAIL_SENDING_DOMAIN}>`;
