import { z } from "zod";

const TEXT_KEYS = [
  "point",
  "proof",
  "text",
  "value",
  "statement",
  "detail",
  "description",
  "metric",
  "name",
  "title",
  "label",
  "summary",
  "why",
  "quote",
];

export const looseString = z.preprocess((v) => {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const key of TEXT_KEYS) {
      if (typeof o[key] === "string") return o[key];
    }
    const parts = Object.values(o).filter((x): x is string => typeof x === "string");
    if (parts.length) return parts.join(" — ");
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return v == null ? "" : String(v);
}, z.string());

export const looseStringArray = z.array(looseString);
