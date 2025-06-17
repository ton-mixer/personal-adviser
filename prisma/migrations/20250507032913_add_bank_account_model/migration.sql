/*
  Warnings:

  - You are about to drop the `FinancialAccount` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "FinancialAccount" DROP CONSTRAINT "FinancialAccount_userId_fkey";

-- DropForeignKey
ALTER TABLE "Statement" DROP CONSTRAINT "Statement_accountId_fkey";

-- AlterTable
ALTER TABLE "Statement" ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3);

-- DropTable
DROP TABLE "FinancialAccount";

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "financialInstitution" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL DEFAULT 'OTHER',
    "lastFourDigits" TEXT,
    "balance" DECIMAL(12,2),
    "notes" TEXT,
    "color" TEXT,
    "institutionLogo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankAccount_userId_idx" ON "BankAccount"("userId");

-- CreateIndex
CREATE INDEX "BankAccount_financialInstitution_idx" ON "BankAccount"("financialInstitution");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_userId_financialInstitution_lastFourDigits_key" ON "BankAccount"("userId", "financialInstitution", "lastFourDigits");

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
