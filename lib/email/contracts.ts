import { z } from "zod";
import { emailAddressSchema, senderSchema } from "./settings";

const headerValue = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));

export const emailPayloadSchema = z.strictObject({
  from: senderSchema,
  to: z.array(emailAddressSchema).length(1),
  reply_to: emailAddressSchema,
  subject: headerValue.max(240),
  html: z.string().min(1).max(100_000),
  text: z.string().min(1).max(50_000),
  headers: z
    .strictObject({
      "List-Unsubscribe": headerValue,
      "List-Unsubscribe-Post": z.literal("List-Unsubscribe=One-Click"),
    })
    .optional(),
  tags: z.tuple([
    z.strictObject({ name: z.literal("send_id"), value: z.uuid() }),
    z.strictObject({
      name: z.literal("kind"),
      value: z.enum(["issue", "confirmation"]),
    }),
  ]),
});

export const frozenEmailSchema = z.strictObject({
  idempotencyKey: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9/_-]+$/),
  payload: emailPayloadSchema,
});

export type EmailPayload = z.infer<typeof emailPayloadSchema>;
export type FrozenEmail = z.infer<typeof frozenEmailSchema>;

export function emailSubject(value: string): string {
  const subject = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (subject.length <= 100) return subject;
  const shortened = subject.slice(0, 99).replace(/\s+\S*$/u, "");
  return `${shortened.trimEnd()}…`;
}
