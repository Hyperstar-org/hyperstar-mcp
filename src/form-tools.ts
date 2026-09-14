import { z } from "zod";
import type { HyperstarClient } from "./http.js";
import { queryFrom } from "./tool-http-helpers.js";
import { toolMetadata } from "./tool-metadata.js";
import { toolResult } from "./tool-result.js";
import type { ToolRegistrar } from "./tool-registrar.js";

const Field = z
  .object({
    field_id: z.enum([
      "name",
      "handle_name",
      "phone",
      "currency",
      "quoted_price",
      "collaboration_terms",
      "delivery_address",
      "payment_info",
      "video_link",
      "message",
    ]),
    label: z.string().trim().min(1).max(500),
    type: z.enum(["text", "url", "number", "textarea", "select"]),
    enabled: z.boolean(),
    required: z.boolean(),
    sort_order: z.number().int().nonnegative(),
  })
  .strict();
const Form = z.object({
  id: z.number().int(),
  name: z.string(),
  guide_text: z.string(),
  is_system: z.boolean(),
  editable: z.boolean(),
  deletable: z.boolean(),
  active_field_count: z.number().int(),
  fields: z.array(Field),
});
const FormInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    guide_text: z.string().max(10000),
    fields: z.array(Field).max(10),
  })
  .strict();
const Target = z.object({ form_id: z.number().int().positive() }).strict();
const guidance =
  "Use form_id when sending and form_language en, ko or jp. Language is a send-time choice. System defaults cannot be edited or deleted; already-sent links retain their snapshot.";

export function registerFormTools(
  server: ToolRegistrar,
  client: HyperstarClient,
): void {
  server.registerTool(
    "list_forms",
    {
      ...toolMetadata("list_forms"),
      inputSchema: z
        .object({
          limit: z.number().int().min(1).max(100).default(25),
          offset: z.number().int().nonnegative().default(0),
        })
        .strict(),
    },
    async (input) =>
      toolResult({
        ...z
          .object({
            forms: z.array(Form),
            total: z.number().int(),
            next_offset: z.number().int().nullable(),
          })
          .parse(await client.get("/v1/forms/library", queryFrom(input))),
        agent_guidance: guidance,
      }),
  );
  server.registerTool(
    "get_form",
    { ...toolMetadata("get_form"), inputSchema: Target },
    async ({ form_id }) =>
      toolResult({
        ...Form.parse(await client.get(`/v1/forms/library/${form_id}`)),
        agent_guidance: guidance,
      }),
  );
  server.registerTool(
    "create_form",
    {
      ...toolMetadata("create_form"),
      inputSchema: FormInput.extend({
        idempotency_key: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[A-Za-z0-9._:-]+$/),
      }),
    },
    async (input) =>
      toolResult(Form.parse(await client.post("/v1/forms/library", input))),
  );
  server.registerTool(
    "update_form",
    {
      ...toolMetadata("update_form"),
      inputSchema: Target.extend(FormInput.shape),
    },
    async ({ form_id, ...body }) =>
      toolResult(
        Form.parse(await client.put(`/v1/forms/library/${form_id}`, body)),
      ),
  );
  server.registerTool(
    "delete_form",
    {
      ...toolMetadata("delete_form"),
      inputSchema: Target.extend({
        confirmation: z.literal("user_authorized"),
      }),
    },
    async ({ form_id }) => {
      await client.delete(`/v1/forms/library/${form_id}`);
      return toolResult({
        form_id,
        deleted: true,
        agent_guidance:
          "Removed from future form selection. Existing sent links retain their snapshots.",
      });
    },
  );
}
