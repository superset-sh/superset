import { z } from 'zod';

export const validateLicenseSchema = z.object({
  licenseKey: z.string().min(1).describe('License key to validate'),
  instanceName: z.string().optional().describe('Instance name (for activation)'),
});

export type ValidateLicenseInput = z.infer<typeof validateLicenseSchema>;
export type ValidateLicenseDto = ValidateLicenseInput;
