-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AdminUser" ("createdAt", "email", "id", "name", "passwordHash") SELECT "createdAt", "email", "id", "name", "passwordHash" FROM "AdminUser";
DROP TABLE "AdminUser";
ALTER TABLE "new_AdminUser" RENAME TO "AdminUser";
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");
CREATE TABLE "new_StaffUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "townId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffUser_townId_fkey" FOREIGN KEY ("townId") REFERENCES "Town" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StaffUser" ("createdAt", "department", "email", "id", "name", "passwordHash", "townId") SELECT "createdAt", "department", "email", "id", "name", "passwordHash", "townId" FROM "StaffUser";
DROP TABLE "StaffUser";
ALTER TABLE "new_StaffUser" RENAME TO "StaffUser";
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
