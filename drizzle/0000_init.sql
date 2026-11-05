CREATE TYPE "public"."alert_severity" AS ENUM('red', 'amber', 'green');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('booked', 'confirmed', 'showed', 'noshow', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."attribution_model" AS ENUM('last_click', 'first_click');--> statement-breakpoint
CREATE TYPE "public"."conversion_type" AS ENUM('appointment', 'payment');--> statement-breakpoint
CREATE TYPE "public"."email_event_type" AS ENUM('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."location_status" AS ENUM('connected', 'disconnected', 'error', 'demo');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('open', 'won', 'lost', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."subject_style" AS ENUM('Question', 'Number', 'Urgency', 'Plain');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"rule" text NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"text" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"location_id" text NOT NULL,
	"id" text NOT NULL,
	"contact_id" text NOT NULL,
	"calendar_id" text,
	"title" text,
	"status" "appointment_status" DEFAULT 'booked' NOT NULL,
	"booked_at" timestamp with time zone NOT NULL,
	"start_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_location_id_id_pk" PRIMARY KEY("location_id","id")
);
--> statement-breakpoint
CREATE TABLE "attributions" (
	"location_id" text NOT NULL,
	"conversion_type" "conversion_type" NOT NULL,
	"conversion_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"email_id" text,
	"click_event_id" bigint,
	"click_at" timestamp with time zone,
	"first_click_at" timestamp with time zone,
	"converted_at" timestamp with time zone NOT NULL,
	"amount_cents" bigint DEFAULT 0 NOT NULL,
	"model" "attribution_model" NOT NULL,
	"window_days" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attributions_location_id_conversion_type_conversion_id_pk" PRIMARY KEY("location_id","conversion_type","conversion_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"location_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"ghl_ref" text,
	CONSTRAINT "campaigns_location_id_id_pk" PRIMARY KEY("location_id","id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"location_id" text NOT NULL,
	"id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"source" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_location_id_id_pk" PRIMARY KEY("location_id","id")
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"email_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"type" "email_event_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"url" text,
	"source" text NOT NULL,
	"dedupe_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"location_id" text NOT NULL,
	"id" text NOT NULL,
	"campaign_id" text,
	"sequence_step_id" text,
	"name" text NOT NULL,
	"subject" text,
	"subject_style" "subject_style" DEFAULT 'Plain' NOT NULL,
	"subject_style_override" "subject_style",
	"from_address" text,
	"utm_campaign" text,
	"utm_content" text,
	"ghl_ref" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "emails_location_id_id_pk" PRIMARY KEY("location_id","id")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company_id" text,
	"status" "location_status" DEFAULT 'disconnected' NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"token_expires_at" timestamp with time zone,
	"scopes" text,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"backfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"location_id" text NOT NULL,
	"id" text NOT NULL,
	"contact_id" text,
	"name" text,
	"value_cents" bigint DEFAULT 0 NOT NULL,
	"status" "opportunity_status" DEFAULT 'open' NOT NULL,
	"pipeline_id" text,
	"stage" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_location_id_id_pk" PRIMARY KEY("location_id","id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"location_id" text NOT NULL,
	"id" text NOT NULL,
	"contact_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"refund_of" text,
	"description" text,
	"paid_at" timestamp with time zone NOT NULL,
	"source" text,
	CONSTRAINT "payments_location_id_id_pk" PRIMARY KEY("location_id","id")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"location_id" text NOT NULL,
	"id" text NOT NULL,
	"sequence_id" text NOT NULL,
	"step_order" integer NOT NULL,
	"name" text NOT NULL,
	"delay_label" text,
	CONSTRAINT "sequence_steps_location_id_id_pk" PRIMARY KEY("location_id","id")
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"location_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"note" text,
	CONSTRAINT "sequences_location_id_id_pk" PRIMARY KEY("location_id","id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"location_id" text PRIMARY KEY NOT NULL,
	"window_days" integer DEFAULT 14 NOT NULL,
	"model" "attribution_model" DEFAULT 'last_click' NOT NULL,
	"reattributing" boolean DEFAULT false NOT NULL,
	"attributed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "tracked_links" (
	"id" text PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"email_id" text NOT NULL,
	"destination" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_locations" (
	"user_id" text NOT NULL,
	"location_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	CONSTRAINT "user_locations_user_id_location_id_pk" PRIMARY KEY("user_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"location_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_fp_idx" ON "alerts" USING btree ("location_id","fingerprint");--> statement-breakpoint
CREATE INDEX "appointments_contact_idx" ON "appointments" USING btree ("location_id","contact_id");--> statement-breakpoint
CREATE INDEX "attributions_email_idx" ON "attributions" USING btree ("location_id","email_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_dedupe_idx" ON "email_events" USING btree ("location_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "email_events_email_idx" ON "email_events" USING btree ("location_id","email_id","type");--> statement-breakpoint
CREATE INDEX "email_events_contact_idx" ON "email_events" USING btree ("location_id","contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "emails_loc_sent_idx" ON "emails" USING btree ("location_id","sent_at");--> statement-breakpoint
CREATE INDEX "emails_loc_utm_idx" ON "emails" USING btree ("location_id","utm_campaign","utm_content");--> statement-breakpoint
CREATE INDEX "emails_loc_ghlref_idx" ON "emails" USING btree ("location_id","ghl_ref");--> statement-breakpoint
CREATE INDEX "payments_contact_idx" ON "payments" USING btree ("location_id","contact_id");--> statement-breakpoint
CREATE INDEX "tracked_links_email_idx" ON "tracked_links" USING btree ("location_id","email_id");