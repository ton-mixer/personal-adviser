/*
  Warnings:

  - You are about to drop the column `accountId` on the `Statement` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Statement" DROP CONSTRAINT "Statement_accountId_fkey";

-- DropIndex
DROP INDEX "Statement_accountId_idx";

-- AlterTable
ALTER TABLE "Statement" DROP COLUMN "accountId";

-- CreateTable
CREATE TABLE "_BankAccountToStatement" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BankAccountToStatement_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_BankAccountToStatement_B_index" ON "_BankAccountToStatement"("B");

-- AddForeignKey
ALTER TABLE "_BankAccountToStatement" ADD CONSTRAINT "_BankAccountToStatement_A_fkey" FOREIGN KEY ("A") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BankAccountToStatement" ADD CONSTRAINT "_BankAccountToStatement_B_fkey" FOREIGN KEY ("B") REFERENCES "Statement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
