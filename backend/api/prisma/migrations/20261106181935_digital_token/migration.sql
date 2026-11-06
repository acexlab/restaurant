-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('WAITING', 'CALLED', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TokenSource" AS ENUM ('WALK_IN', 'REMOTE');

-- CreateTable
CREATE TABLE "queues" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'A',
    "averageServiceMinutes" INTEGER NOT NULL DEFAULT 15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "counterDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_tokens" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "queueId" UUID NOT NULL,
    "serviceDate" DATE NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" "TokenStatus" NOT NULL DEFAULT 'WAITING',
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "source" "TokenSource" NOT NULL DEFAULT 'WALK_IN',
    "customerName" TEXT,
    "customerPhone" TEXT,
    "partySize" INTEGER,
    "calledCount" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "queue_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "queues_tenantId_idx" ON "queues"("tenantId");

-- CreateIndex
CREATE INDEX "queue_tokens_queueId_serviceDate_status_idx" ON "queue_tokens"("queueId", "serviceDate", "status");

-- CreateIndex
CREATE INDEX "queue_tokens_tenantId_idx" ON "queue_tokens"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "queue_tokens_queueId_serviceDate_number_key" ON "queue_tokens"("queueId", "serviceDate", "number");

-- AddForeignKey
ALTER TABLE "queue_tokens" ADD CONSTRAINT "queue_tokens_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "queues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant isolation (same policy as every tenant-scoped table, see rls_policies migration).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['queues', 'queue_tokens'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("tenantId" = app_current_tenant() OR app_is_system())
         WITH CHECK ("tenantId" = app_current_tenant() OR app_is_system())', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON queues, queue_tokens TO xeva_app;
