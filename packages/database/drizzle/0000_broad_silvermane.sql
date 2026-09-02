CREATE TYPE "public"."access_level" AS ENUM('public', 'member');--> statement-breakpoint
CREATE TYPE "public"."bot_send_status" AS ENUM('unknown', 'available', 'not_started', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."conversion_event_type" AS ENUM('membership_cta_open', 'membership_activated');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."app_environment" AS ENUM('development', 'test', 'staging', 'production');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('pending', 'available', 'invalid', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('video', 'image', 'thumbnail', 'cover', 'file');--> statement-breakpoint
CREATE TYPE "public"."media_variant" AS ENUM('source', 'browse', 'thumbnail');--> statement-breakpoint
CREATE TYPE "public"."presentation_scope" AS ENUM('public_preview', 'protected_content');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('draft', 'published', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."section_type" AS ENUM('play', 'episodes', 'stills', 'comic_catalog', 'gallery', 'photoshoot', 'behind_the_scenes');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('movie', 'episode', 'short_video', 'comic_chapter', 'image_set', 'photoshoot_set', 'behind_the_scenes_video');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."work_type" AS ENUM('video', 'comic', 'gallery', 'photoshoot');--> statement-breakpoint
CREATE TABLE "admin_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_user_id" bigint NOT NULL,
	"role_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"request_id" text NOT NULL,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "content_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"unit_id" uuid,
	"event_type" text NOT NULL,
	"weight" numeric(8, 3) DEFAULT '1' NOT NULL,
	"recommendation_request_id" uuid,
	"source" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"algorithm_version" text,
	"placement" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_work_id" uuid,
	"source_unit_id" uuid,
	"target_work_id" uuid,
	"target_unit_id" uuid,
	"relation_type" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"type" "section_type" NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"publication_status" "publication_status" DEFAULT 'draft' NOT NULL,
	"access_level" "access_level",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"type" "unit_type" NOT NULL,
	"title" text NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"season_number" integer,
	"episode_number" integer,
	"chapter_number" numeric(10, 2),
	"summary" text,
	"cover_asset_id" uuid,
	"publication_status" "publication_status" DEFAULT 'draft' NOT NULL,
	"access_level" "access_level",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid,
	"access_level" "access_level" NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"source" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_work_id_pk" PRIMARY KEY("user_id","work_id")
);
--> statement-breakpoint
CREATE TABLE "ingestion_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_chat_id" bigint NOT NULL,
	"source_message_id" integer NOT NULL,
	"media_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"operator_admin_id" uuid,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid,
	"unit_id" uuid,
	"type" "media_type" NOT NULL,
	"role" text NOT NULL,
	"storage_chat_id" bigint NOT NULL,
	"source_message_id" integer NOT NULL,
	"file_id" text NOT NULL,
	"file_unique_id" text,
	"file_name" text,
	"mime_type" text,
	"file_size" bigint,
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"video_version" text,
	"pixel_count" bigint,
	"is_primary" boolean DEFAULT false NOT NULL,
	"logical_asset_id" uuid,
	"parent_asset_id" uuid,
	"variant" "media_variant",
	"presentation_scope" "presentation_scope" DEFAULT 'protected_content' NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"status" "media_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_owner_check" CHECK ("media_assets"."work_id" is not null or "media_assets"."unit_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "media_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"source_chat_id" bigint NOT NULL,
	"source_message_id" integer NOT NULL,
	"target_chat_id" bigint NOT NULL,
	"target_message_id" integer,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"protected_content" boolean DEFAULT true NOT NULL,
	"idempotency_key" text NOT NULL,
	"telegram_error_code" integer,
	"telegram_error_description" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_id" uuid,
	"event_type" "conversion_event_type" NOT NULL,
	"source_placement" text,
	"recommendation_request_id" uuid,
	"token_hash" text,
	"idempotency_key" text NOT NULL,
	"actor_admin_id" uuid,
	"attributed_open_event_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_cta_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"work_id" uuid,
	"source_placement" text NOT NULL,
	"recommendation_request_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_cta_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "reading_progress" (
	"user_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"progress_type" text NOT NULL,
	"current_page" integer,
	"total_pages" integer,
	"scroll_anchor" text,
	"reading_mode" text,
	"page_layout" text,
	"reading_direction" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_progress_user_id_unit_id_pk" PRIMARY KEY("user_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_enabled" boolean DEFAULT true NOT NULL,
	"recommendation_version" text DEFAULT 'mvp-v1' NOT NULL,
	"membership_cta_text" text DEFAULT '开通会员' NOT NULL,
	"membership_cta_url" text,
	"membership_cta_version" integer DEFAULT 1 NOT NULL,
	"environment" "app_environment" DEFAULT 'development' NOT NULL,
	"updated_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_interest_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"type_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tag_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"topic_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cold_start_complete" boolean DEFAULT false NOT NULL,
	"algorithm_version" text DEFAULT 'mvp-v1' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_user_id" bigint NOT NULL,
	"username" text,
	"display_name" text NOT NULL,
	"language_code" text,
	"photo_url" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"member_active" boolean DEFAULT false NOT NULL,
	"member_expires_at" timestamp with time zone,
	"bot_started_at" timestamp with time zone,
	"bot_send_status" "bot_send_status" DEFAULT 'unknown' NOT NULL,
	"bot_send_status_checked_at" timestamp with time zone,
	"bot_send_failure_reason" text,
	"first_login_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "work_type" NOT NULL,
	"subtype" text,
	"title" text NOT NULL,
	"original_title" text,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"public_cover_asset_id" uuid,
	"region" text,
	"release_year" integer,
	"release_date" date,
	"language" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"release_status" text,
	"content_rating" text,
	"directors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"screenwriters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"producers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"production_companies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_episodes" integer,
	"duration_seconds" integer,
	"authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"original_authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"artists" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"publisher" text,
	"serialization_platform" text,
	"serialization_status" text,
	"photographers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subjects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"studio" text,
	"shoot_date" date,
	"location" text,
	"volume_count" integer,
	"publication_status" "publication_status" DEFAULT 'draft' NOT NULL,
	"access_level" "access_level",
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "works_release_year_check" CHECK ("works"."release_year" is null or ("works"."release_year" >= 1800 and "works"."release_year" <= 3000))
);
--> statement-breakpoint
ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_events" ADD CONSTRAINT "content_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_events" ADD CONSTRAINT "content_events_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_events" ADD CONSTRAINT "content_events_unit_id_content_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."content_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_relations" ADD CONSTRAINT "content_relations_source_work_id_works_id_fk" FOREIGN KEY ("source_work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_relations" ADD CONSTRAINT "content_relations_source_unit_id_content_units_id_fk" FOREIGN KEY ("source_unit_id") REFERENCES "public"."content_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_relations" ADD CONSTRAINT "content_relations_target_work_id_works_id_fk" FOREIGN KEY ("target_work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_relations" ADD CONSTRAINT "content_relations_target_unit_id_content_units_id_fk" FOREIGN KEY ("target_unit_id") REFERENCES "public"."content_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_sections" ADD CONSTRAINT "content_sections_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_units" ADD CONSTRAINT "content_units_section_id_content_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."content_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_items" ADD CONSTRAINT "ingestion_items_operator_admin_id_admin_accounts_id_fk" FOREIGN KEY ("operator_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_unit_id_content_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."content_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_deliveries" ADD CONSTRAINT "media_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_deliveries" ADD CONSTRAINT "media_deliveries_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_deliveries" ADD CONSTRAINT "media_deliveries_unit_id_content_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."content_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_deliveries" ADD CONSTRAINT "media_deliveries_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_conversion_events" ADD CONSTRAINT "membership_conversion_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_conversion_events" ADD CONSTRAINT "membership_conversion_events_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_conversion_events" ADD CONSTRAINT "membership_conversion_events_actor_admin_id_admin_accounts_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_cta_tokens" ADD CONSTRAINT "membership_cta_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_cta_tokens" ADD CONSTRAINT "membership_cta_tokens_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_unit_id_content_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."content_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_admin_id_admin_accounts_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interest_profiles" ADD CONSTRAINT "user_interest_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_accounts_telegram_user_id_unique" ON "admin_accounts" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_admin_time_index" ON "admin_audit_logs" USING btree ("admin_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_events_user_idempotency_unique" ON "content_events" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "content_events_user_time_index" ON "content_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "content_sections_work_index" ON "content_sections" USING btree ("work_id","sort_order");--> statement-breakpoint
CREATE INDEX "content_units_section_index" ON "content_units" USING btree ("section_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "content_units_section_ordinal_unique" ON "content_units" USING btree ("section_id","ordinal");--> statement-breakpoint
CREATE INDEX "entitlements_user_validity_index" ON "entitlements" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_items_source_unique" ON "ingestion_items" USING btree ("storage_chat_id","source_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_source_unique" ON "media_assets" USING btree ("storage_chat_id","source_message_id");--> statement-breakpoint
CREATE INDEX "media_assets_unit_index" ON "media_assets" USING btree ("unit_id","ordinal");--> statement-breakpoint
CREATE INDEX "media_assets_logical_variant_index" ON "media_assets" USING btree ("logical_asset_id","variant");--> statement-breakpoint
CREATE UNIQUE INDEX "media_deliveries_user_idempotency_unique" ON "media_deliveries" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "media_deliveries_status_index" ON "media_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_conversion_idempotency_unique" ON "membership_conversion_events" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "membership_conversion_user_time_index" ON "membership_conversion_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "membership_cta_tokens_user_expiry_index" ON "membership_cta_tokens" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_user_id_unique" ON "users" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "works_publication_sort_index" ON "works" USING btree ("publication_status","sort_order");--> statement-breakpoint
CREATE INDEX "works_type_index" ON "works" USING btree ("type");