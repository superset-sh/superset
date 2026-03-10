import { z } from 'zod';

export const webhookEventSchema = z.object({
  meta: z.object({
    event_name: z.string(),
    test_mode: z.boolean(),
    custom_data: z.record(z.any()).optional(),
  }),
  data: z.object({
    type: z.string(),
    id: z.string(),
    attributes: z.record(z.any()),
    relationships: z.record(z.any()).optional(),
  }),
});

export type WebhookEventInput = z.infer<typeof webhookEventSchema>;
export type WebhookEventDto = WebhookEventInput;
