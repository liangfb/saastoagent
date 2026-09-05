CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "rules" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_policies_enabled_priority" ON "policies"("enabled", "priority" DESC);
