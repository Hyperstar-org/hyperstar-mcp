import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { JsonObject, JsonValue } from "./http.js";

/** Render a tool result as JSON text and MCP structured content. */
export function toolResult(output: JsonValue): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(output, null, 2),
      },
    ],
    structuredContent: structuredContentFrom(output),
  };
}

function structuredContentFrom(output: JsonValue): Record<string, unknown> {
  if (isJsonObject(output)) {
    return output as Record<string, unknown>;
  }
  return { result: output };
}

/** Narrow a JSON value to an object record. */
function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
