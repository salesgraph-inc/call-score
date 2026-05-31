import { z } from "zod";

export const evidenceSchema = z
  .union([
    z.string(),
    z.object({
      speaker: z.string().optional(),
      quote: z.string().optional(),
      text: z.string().optional(),
    }),
  ])
  .transform((e) =>
    typeof e === "string" ? { quote: e } : { speaker: e.speaker, quote: e.quote ?? e.text ?? "" },
  );
