import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export const READ_ONLY = "read_only";
export const WRITE = "write";
export const DESTRUCTIVE = "destructive";

type ToolBehavior = typeof READ_ONLY | typeof WRITE | typeof DESTRUCTIVE;

/** Build MCP tool annotations required for directory review. */
export function annotations(
  title: string,
  behavior: ToolBehavior,
): ToolAnnotations & {
  readonly title: string;
} {
  if (behavior === READ_ONLY) {
    return {
      title,
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    };
  }
  return {
    title,
    readOnlyHint: false,
    destructiveHint: behavior === DESTRUCTIVE,
    openWorldHint: true,
  };
}
