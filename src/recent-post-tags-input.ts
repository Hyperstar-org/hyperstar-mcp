import { z } from "zod";

const RecentTagListSchema = z
  .array(z.string())
  .min(1)
  .transform((values, context) => {
    const normalized = values.map((value) =>
      value.trim().replace(/^#/, "").toLocaleLowerCase(),
    );
    if (normalized.some((value) => value.length === 0 || value.length > 64)) {
      context.addIssue({
        code: "custom",
        message: "tags must be non-blank and at most 64 characters",
      });
      return z.NEVER;
    }
    const deduplicated = [...new Set(normalized)];
    if (deduplicated.length > 1) {
      context.addIssue({
        code: "custom",
        message: "any_of must contain at most 1 tag",
      });
      return z.NEVER;
    }
    return deduplicated;
  });

export const RecentPostTagsSchema = z
  .object({
    window_size: z.number().int().min(1).max(15),
    include: z
      .object({
        any_of: RecentTagListSchema,
        min_posts: z.number().int().min(2).max(15),
      })
      .strict()
      .optional(),
    exclude: z
      .object({
        any_of: RecentTagListSchema,
        max_posts: z.number().int().min(0).max(14),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.include === undefined && value.exclude === undefined) {
      context.addIssue({
        code: "custom",
        message: "recent_post_tags requires include or exclude",
      });
    }
    if (value.include && value.include.min_posts > value.window_size) {
      context.addIssue({
        code: "custom",
        message: "include.min_posts must be at most window_size",
        path: ["include", "min_posts"],
      });
    }
    if (value.exclude && value.exclude.max_posts >= value.window_size) {
      context.addIssue({
        code: "custom",
        message: "exclude.max_posts must be less than window_size",
        path: ["exclude", "max_posts"],
      });
    }
  });
