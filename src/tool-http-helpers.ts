import type { JsonObject, JsonValue } from "./http.js";

type QueryValue =
  | string
  | number
  | boolean
  | readonly (string | number | boolean)[]
  | undefined;

/** Encode one dynamic route segment before interpolating it into a path. */
export function pathSegment(value: string | number): string {
  const raw = String(value).trim();
  if (raw.length === 0 || raw === "." || raw === "..") {
    throw new Error("Hyperstar API path segment must be non-empty and safe");
  }
  return encodeURIComponent(raw);
}

/** Convert defined scalar and array inputs into URL query parameters. */
export function queryFrom(input: Record<string, QueryValue>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, String(item));
      }
      continue;
    }
    query.set(key, String(value));
  }
  return query;
}

/** Build a JSON object without retaining omitted optional fields. */
export function compactJsonObject(
  entries: readonly (readonly [string, JsonValue | undefined])[],
): JsonObject {
  const output: Record<string, JsonValue> = {};
  for (const [key, value] of entries) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}
