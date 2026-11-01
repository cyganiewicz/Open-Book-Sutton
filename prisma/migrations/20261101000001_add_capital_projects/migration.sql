-- AlterTable
ALTER TABLE "Town" ADD COLUMN "capitalSettings" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "CapitalDepartment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "townId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CapitalDepartment_townId_fkey" FOREIGN KEY ("townId") REFERENCES "Town" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CapitalDepartmentMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    CONSTRAINT "CapitalDepartmentMember_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "CapitalDepartment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CapitalDepartmentMember_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CapitalProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "townId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "category" TEXT,
    "priority" INTEGER,
    "deptRank" INTEGER,
    "whyImportant" TEXT,
    "alternatives" TEXT,
    "whoServed" TEXT,
    "usersServed" INTEGER,
    "usefulLifeYears" INTEGER,
    "consequences" TEXT,
    "maintenanceNeeds" TEXT,
    "costBasis" TEXT,
    "benefits" TEXT,
    "estimateType" TEXT,
    "quoteDate" DATETIME,
    "grantEligible" BOOLEAN NOT NULL DEFAULT false,
    "grantNotes" TEXT,
    "operatingImpact" REAL,
    "operatingImpactNotes" TEXT,
    "costBreakdown" TEXT NOT NULL DEFAULT '[]',
    "proposedFunding" TEXT NOT NULL DEFAULT '[]',
    "firstRequestedFY" TEXT,
    "requestStatus" TEXT NOT NULL DEFAULT 'draft',
    "approvedFY" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" DATETIME,
    "projectStatus" TEXT NOT NULL DEFAULT 'not_started',
    "percentComplete" INTEGER,
    "statusSummary" TEXT,
    "statusUpdatedAt" DATETIME,
    "actualCost" REAL,
    "completedOn" DATETIME,
    "evalScores" TEXT NOT NULL DEFAULT '{}',
    "evalNotes" TEXT,
    "evalPriorityOverride" INTEGER,
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CapitalProject_townId_fkey" FOREIGN KEY ("townId") REFERENCES "Town" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CapitalProject_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "CapitalDepartment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CapitalProjectYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "requestedAmount" REAL NOT NULL DEFAULT 0,
    "recommendedAmount" REAL,
    "approvedAmount" REAL,
    "fundingSplit" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT,
    CONSTRAINT "CapitalProjectYear_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CapitalProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CapitalStatusUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "percentComplete" INTEGER,
    "note" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CapitalStatusUpdate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CapitalProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CapitalComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "body" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CapitalComment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CapitalProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CapitalAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    "caption" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "uploadedByName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CapitalAttachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CapitalProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CapitalDepartment_townId_name_key" ON "CapitalDepartment"("townId", "name");
CREATE UNIQUE INDEX "CapitalDepartment_townId_code_key" ON "CapitalDepartment"("townId", "code");
CREATE INDEX "CapitalDepartmentMember_staffUserId_idx" ON "CapitalDepartmentMember"("staffUserId");
CREATE UNIQUE INDEX "CapitalDepartmentMember_departmentId_staffUserId_key" ON "CapitalDepartmentMember"("departmentId", "staffUserId");
CREATE UNIQUE INDEX "CapitalProject_townId_code_key" ON "CapitalProject"("townId", "code");
CREATE INDEX "CapitalProject_townId_requestStatus_idx" ON "CapitalProject"("townId", "requestStatus");
CREATE INDEX "CapitalProject_departmentId_idx" ON "CapitalProject"("departmentId");
CREATE UNIQUE INDEX "CapitalProjectYear_projectId_fiscalYear_key" ON "CapitalProjectYear"("projectId", "fiscalYear");
CREATE INDEX "CapitalStatusUpdate_projectId_createdAt_idx" ON "CapitalStatusUpdate"("projectId", "createdAt");
CREATE INDEX "CapitalComment_projectId_createdAt_idx" ON "CapitalComment"("projectId", "createdAt");
CREATE INDEX "CapitalAttachment_projectId_kind_idx" ON "CapitalAttachment"("projectId", "kind");
