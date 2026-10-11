-- SQLite initial schema. Separate from PostgreSQL migrations; for NEW local installations.
-- There is no automatic Postgres-to-SQLite data migration.
CREATE TABLE "User" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "email" TEXT NOT NULL,
 "passwordHash" TEXT NOT NULL,
 "role" TEXT NOT NULL DEFAULT 'OWNER',
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Session" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL,
 "csrf" TEXT NOT NULL,
 "expiresAt" DATETIME NOT NULL,
 CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Company" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "name" TEXT NOT NULL,
 "normalizedName" TEXT NOT NULL,
 "city" TEXT NOT NULL COLLATE NOCASE,
 "region" TEXT NOT NULL DEFAULT '',
 "niche" TEXT NOT NULL,
 "address" TEXT NOT NULL DEFAULT '',
 "inn" TEXT,
 "ogrn" TEXT,
 "website" TEXT,
 "domain" TEXT,
 "phone" TEXT,
 "email" TEXT,
 "contactBasis" TEXT NOT NULL DEFAULT '',
 "websiteStatus" TEXT NOT NULL DEFAULT 'NOT_FOUND',
 "noWebsiteConfirmed" BOOLEAN NOT NULL DEFAULT false,
 "active" BOOLEAN,
 "activeEvidence" TEXT NOT NULL DEFAULT '',
 "highTicket" BOOLEAN,
 "highTicketEvidence" TEXT NOT NULL DEFAULT '',
 "automation" BOOLEAN,
 "automationEvidence" TEXT NOT NULL DEFAULT '',
 "productFit" BOOLEAN,
 "productFitEvidence" TEXT NOT NULL DEFAULT '',
 "manualWebsiteNeed" BOOLEAN,
 "manualWebsiteEvidence" TEXT NOT NULL DEFAULT '',
 "score" INTEGER NOT NULL DEFAULT 0,
 "scoreDetails" JSONB NOT NULL DEFAULT '[]',
 "crmStatus" TEXT NOT NULL DEFAULT 'NEW',
 "product" TEXT NOT NULL DEFAULT 'Мини-платформа 30 000 ₽',
 "negotiationResult" TEXT NOT NULL DEFAULT '',
 "lastContactAt" DATETIME,
 "revision" INTEGER NOT NULL DEFAULT 0,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "CompanySource" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "companyId" TEXT NOT NULL,
 "provider" TEXT NOT NULL,
 "externalId" TEXT,
 "sourceUrl" TEXT NOT NULL DEFAULT '',
 "license" TEXT NOT NULL DEFAULT '',
 "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CompanySource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "WebsiteAudit" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "companyId" TEXT NOT NULL,
 "website" TEXT NOT NULL,
 "status" TEXT NOT NULL,
 "metrics" JSONB NOT NULL,
 "issues" JSONB NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WebsiteAudit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Note" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "companyId" TEXT NOT NULL,
 "text" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Note_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Task" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "companyId" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "dueAt" DATETIME NOT NULL,
 "done" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Activity" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "companyId" TEXT NOT NULL,
 "type" TEXT NOT NULL,
 "details" JSONB NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "DuplicateCandidate" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "companyId" TEXT NOT NULL,
 "matchedId" TEXT NOT NULL,
 "reason" TEXT NOT NULL,
 CONSTRAINT "DuplicateCandidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "DuplicateCandidate_matchedId_fkey" FOREIGN KEY ("matchedId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Job" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "type" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "payload" JSONB NOT NULL,
 "progress" JSONB NOT NULL DEFAULT '{}',
 "error" TEXT,
 "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "startedAt" DATETIME,
 "finishedAt" DATETIME,
 "heartbeatAt" DATETIME
);
-- Obtain a write lock first when claiming jobs or ingesting/merging companies.
CREATE TABLE "_WriteLock" ("id" INTEGER NOT NULL PRIMARY KEY, "revision" INTEGER NOT NULL DEFAULT 0);
INSERT INTO "_WriteLock" ("id", "revision") VALUES (1, 0);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "Company_inn_key" ON "Company"("inn");
CREATE UNIQUE INDEX "Company_ogrn_key" ON "Company"("ogrn");
CREATE INDEX "Company_city_niche_idx" ON "Company"("city", "niche");
CREATE INDEX "Company_score_crmStatus_idx" ON "Company"("score", "crmStatus");
CREATE INDEX "Company_normalizedName_city_idx" ON "Company"("normalizedName", "city");
CREATE INDEX "Company_domain_idx" ON "Company"("domain");
CREATE INDEX "CompanySource_companyId_idx" ON "CompanySource"("companyId");
CREATE UNIQUE INDEX "CompanySource_provider_externalId_key" ON "CompanySource"("provider", "externalId");
CREATE INDEX "WebsiteAudit_companyId_createdAt_idx" ON "WebsiteAudit"("companyId", "createdAt");
CREATE INDEX "Task_done_dueAt_idx" ON "Task"("done", "dueAt");
CREATE UNIQUE INDEX "DuplicateCandidate_companyId_matchedId_key" ON "DuplicateCandidate"("companyId", "matchedId");
CREATE INDEX "Job_status_createdAt_idx" ON "Job"("status", "createdAt");
