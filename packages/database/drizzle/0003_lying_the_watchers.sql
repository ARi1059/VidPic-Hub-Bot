CREATE TYPE "public"."archive_sort_direction" AS ENUM('asc', 'desc');--> statement-breakpoint
CREATE TYPE "public"."archive_sort_kind" AS ENUM('natural', 'numeric', 'chapter_page', 'path');--> statement-breakpoint
ALTER TYPE "public"."media_type" ADD VALUE 'archive';--> statement-breakpoint
CREATE TABLE "archive_sort_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "archive_sort_kind" NOT NULL,
	"file_pattern" text,
	"chapter_pattern" text,
	"page_pattern" text,
	"direction" "archive_sort_direction" DEFAULT 'asc' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "archive_sort_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "archive_sort_rules" ADD CONSTRAINT "archive_sort_rules_created_by_admin_id_admin_accounts_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "archive_sort_rules_name_unique" ON "archive_sort_rules" USING btree ("name");--> statement-breakpoint
CREATE INDEX "archive_sort_rules_active_index" ON "archive_sort_rules" USING btree ("enabled","priority");--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_archive_sort_rule_id_archive_sort_rules_id_fk" FOREIGN KEY ("archive_sort_rule_id") REFERENCES "public"."archive_sort_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "archive_sort_rules" ("id", "name", "description", "kind", "direction", "priority", "enabled", "system") VALUES
  ('00000000-0000-4000-8000-000000000721', '自然文件名', '按文件名自然顺序排列，例如 page-2 位于 page-10 前。', 'natural', 'asc', 100, true, true),
  ('00000000-0000-4000-8000-000000000722', '数字序号', '从完整路径中提取数字序列排序，兼容 001、1、10 等命名。', 'numeric', 'asc', 110, true, true),
  ('00000000-0000-4000-8000-000000000723', '章节与页码', '先按章节，再按页码；支持用自定义规则补充正则表达式。', 'chapter_page', 'asc', 120, true, true),
  ('00000000-0000-4000-8000-000000000724', '目录路径', '先按压缩包内目录，再按文件名自然顺序排列。', 'path', 'asc', 130, true, true)
ON CONFLICT ("name") DO UPDATE SET
  "description" = EXCLUDED."description",
  "kind" = EXCLUDED."kind",
  "direction" = EXCLUDED."direction",
  "priority" = EXCLUDED."priority",
  "enabled" = EXCLUDED."enabled",
  "system" = EXCLUDED."system",
  "updated_at" = now();
