import type { ComponentType } from "react";

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
}

export interface TemplateModule {
  default: ComponentType;
  metadata: TemplateMetadata;
}

export const templateRegistry: Record<string, () => Promise<TemplateModule>> = {
  "saas-01": () => import("./saas-01") as Promise<TemplateModule>,
  "startup-01": () => import("./startup-01") as Promise<TemplateModule>,
  "agency-01": () => import("./agency-01") as Promise<TemplateModule>,
};

export const DEFAULT_TEMPLATE = "saas-01";

export function getTemplateId(): string {
  return process.env.LANDING_TEMPLATE || DEFAULT_TEMPLATE;
}

export function getTemplateIds(): string[] {
  return Object.keys(templateRegistry);
}
