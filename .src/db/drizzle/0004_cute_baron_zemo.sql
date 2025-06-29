ALTER TABLE "users" ALTER COLUMN "source" SET DATA TYPE "public"."source";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "source" SET DEFAULT 'password';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payment_Id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "role" DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_Id_unique" UNIQUE("payment_Id");