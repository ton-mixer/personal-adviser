import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { TRPCError } from "@trpc/server";
import { processUploadedFile } from "@/lib/file-processing";
import { extractAccountInfo, extractStatementPeriod } from "@/lib/account-extractor";

// Use string constants for the enum
const StatementStatus = {
  UPLOADED: "UPLOADED",
  PROCESSING: "PROCESSING",
  REVIEW_NEEDED: "REVIEW_NEEDED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

const STORAGE_BUCKET = "statements";

// Mock function for Google Sheets integration
// This will be replaced with actual Sheets API implementation
async function saveToGoogleSheets(userId: string, transactions: any[]) {
  console.log(
    `[MOCK] Saving ${transactions.length} transactions to Google Sheets for user ${userId}`,
  );
  // In a real implementation, this would use the Google Sheets API
  // to write the transaction data to the user's spreadsheet
  return true;
}


export const statementRouter = createTRPCRouter({
  // Get recent statements for the dashboard
  getRecent: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.user.id) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User ID is not available",
      });
    }

    const statements = await ctx.prisma.statement.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      orderBy: {
        uploadTimestamp: "desc",
      },
      take: 5,
      include: {
        accounts: true,
      },
    });

    return statements;
  }),

  // Check for duplicate statement before uploading
  checkDuplicate: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        fileUrl: z.string().url(),
        fileType: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Check if a statement with the same filename already exists
        const existingStatement = await ctx.prisma.statement.findFirst({
          where: {
            userId: ctx.session.user.id,
            filename: input.filename,
          },
        });

        // If we found an exact filename match, return immediately
        if (existingStatement) {
          return {
            isDuplicate: true,
            duplicateType: 'filename',
            statement: existingStatement,
            accounts: [],
            potentialAccounts: [],
          };
        }

        // Process the file to check statement period and accounts
        const processingResult = await processUploadedFile(
          input.fileUrl,
          input.fileType
        );

        if (!processingResult.success || !processingResult.data) {
          return {
            isDuplicate: false,
            error: processingResult.error || "Failed to process statement",
          };
        }

        // Extract data from the result
        const { 
          bankName, 
          accounts, 
          statementPeriodStartDate, 
          statementPeriodEndDate 
        } = processingResult.data;

        // No accounts or period data, can't check for duplicates
        if (!accounts || accounts.length === 0 || !statementPeriodStartDate || !statementPeriodEndDate) {
          return {
            isDuplicate: false,
            warning: "Could not extract account information or statement period",
          };
        }

        // Format statement period dates
        const periodStart = new Date(statementPeriodStartDate);
        const periodEnd = new Date(statementPeriodEndDate);

        // Check for statements with the same period
        const statementsInPeriod = await ctx.prisma.statement.findMany({
          where: {
            userId: ctx.session.user.id,
            periodStart: {
              gte: new Date(periodStart.setDate(periodStart.getDate() - 3)), // Allow 3-day margin
              lte: new Date(periodStart.setDate(periodStart.getDate() + 6)),  // 3 days before + 3 days after
            },
            periodEnd: {
              gte: new Date(periodEnd.setDate(periodEnd.getDate() - 3)), // Allow 3-day margin
              lte: new Date(periodEnd.setDate(periodEnd.getDate() + 6)),  // 3 days before + 3 days after
            },
          },
          include: {
            accounts: true,
          },
        });

        // Extract account last 4 digits for comparison
        const lastFourDigits = accounts.map(account => account.accountNumberLast4).filter(Boolean);
        
        // Find existing bank accounts that match these last 4 digits
        const matchingBankAccounts = await ctx.prisma.bankAccount.findMany({
          where: {
            userId: ctx.session.user.id,
            lastFourDigits: {
              in: lastFourDigits as string[],
            },
          },
        });

        // Find duplicates where both period and at least one account matches
        let duplicateStatement = null;
        if (statementsInPeriod.length > 0 && lastFourDigits.length > 0) {
          duplicateStatement = statementsInPeriod.find(statement => 
            statement.accounts.some(account => 
              lastFourDigits.includes(account.lastFourDigits || '')
            )
          );
        }

        return {
          isDuplicate: !!duplicateStatement,
          duplicateType: duplicateStatement ? 'periodAndAccount' : statementsInPeriod.length > 0 ? 'period' : null,
          statement: duplicateStatement,
          accounts: matchingBankAccounts,
          potentialAccounts: accounts,
          statementPeriod: {
            start: statementPeriodStartDate,
            end: statementPeriodEndDate,
          },
          statementsInPeriod: statementsInPeriod,
        };
        
      } catch (error) {
        console.error("Error checking for duplicate statement:", error);
        return {
          isDuplicate: false,
          error: "Error checking for duplicate statement",
        };
      }
    }),

  // Upload a new statement
  upload: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        fileType: z.string(),
        fileUrl: z.string().url(),// Optional: If user already selected an account
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Create a record in the database to track the statement
        const statement = await ctx.prisma.statement.create({
          data: {
            filename: input.filename,
            userId: ctx.session.user.id,
            status: StatementStatus.UPLOADED,
            storageUrl: input.fileUrl
          },
        });

        // Start processing the file in the background
        void (async () => {
          try {
            // Update status to processing
            await ctx.prisma.statement.update({
              where: { id: statement.id },
              data: { status: StatementStatus.PROCESSING },
            });

            // Process the file with Vision AI
            const processingResult = await processUploadedFile(
              input.fileUrl,
              input.fileType
            );

            if (!processingResult.success || !processingResult.data) {
              throw new Error(
                processingResult.error || "Failed to process statement text"
              );
            }

            // Check required fields in the data
            const { bankName, accounts, statementPeriodStartDate, statementPeriodEndDate } = processingResult.data;
            if (!bankName || !accounts || accounts.length === 0 || !statementPeriodStartDate || !statementPeriodEndDate) {
              throw new Error("Incomplete statement data: missing bank name, accounts, or statement period");
            }

            // Use statement period directly from the processed data
            const periodInfo = {
              start: new Date(statementPeriodStartDate),
              end: new Date(statementPeriodEndDate)
            };

            console.log(`Statement contains ${accounts.length} accounts`);
            
            // Initialize an array of bank account IDs to connect to this statement
            const accountIdsToConnect: string[] = [];
            
            // Process all accounts from the statement
            for (let i = 0; i < accounts.length; i++) {
              const account = accounts[i];
              
              // Skip accounts without last 4 digits (can't reliably identify)
              if (!account.accountNumberLast4) {
                console.log(`Skipping account at index ${i} without last 4 digits`);
                continue;
              }
              
              // Map string account type to enum AccountType
              const mappedAccountType = account.accountType === "Advantage Plus Banking" ? "CHECKING" : 
                                      (account.accountType && ["CHECKING", "SAVINGS", "CREDIT", "INVESTMENT", "OTHER"].includes(account.accountType) ? 
                                        account.accountType as "CHECKING" | "SAVINGS" | "CREDIT" | "INVESTMENT" | "OTHER" : 
                                        "OTHER");
              
              // Try to find or create the bank account
              let bankAccount = await ctx.prisma.bankAccount.findFirst({
                where: {
                  userId: ctx.session.user.id,
                  financialInstitution: bankName,
                  lastFourDigits: account.accountNumberLast4,
                },
              });
              
              if (bankAccount) {
                // Update existing account if needed
                if (account.metadata?.endingBalance !== undefined) {
                  await ctx.prisma.bankAccount.update({
                    where: { id: bankAccount.id },
                    data: { balance: account.metadata.endingBalance.toString() },
                  });
                }
              } else {
                // Create a new bank account
                bankAccount = await ctx.prisma.bankAccount.create({
                  data: {
                    userId: ctx.session.user.id,
                    name: account.accountType || `${bankName} Account`,
                    financialInstitution: bankName,
                    accountType: mappedAccountType,
                    lastFourDigits: account.accountNumberLast4,
                    balance: account.metadata?.endingBalance !== undefined ? 
                             account.metadata.endingBalance.toString() : null,
                  },
                });
              }
              
              // Add this account ID to our list to connect
              if (!accountIdsToConnect.includes(bankAccount.id)) {
                accountIdsToConnect.push(bankAccount.id);
              }
            }
            
            // Update the statement with all accounts and period info
            await ctx.prisma.statement.update({
              where: { id: statement.id },
              data: {
                status: StatementStatus.COMPLETED,
                processedTimestamp: new Date(),
                periodStart: periodInfo.start,
                periodEnd: periodInfo.end,
                accounts: {
                  connect: accountIdsToConnect.map(id => ({ id }))
                }
              },
            });

            console.log(`Statement ${statement.id} processed successfully with ${accountIdsToConnect.length} accounts`);
          } catch (error) {
            console.error("Error processing statement:", error);
            
            // Update statement with error
            await ctx.prisma.statement.update({
              where: { id: statement.id },
              data: {
                status: StatementStatus.FAILED,
                errorMessage: error instanceof Error ? error.message : "Unknown error",
                processedTimestamp: new Date(),
              },
            });
          }
        })();

        // Immediately return the statement ID for the client
        return {
          success: true,
          statementId: statement.id,
        };
      } catch (error) {
        console.error("Error uploading statement:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload statement",
        });
      }
    }),

  // Process an existing statement
  process: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const statement = await ctx.prisma.statement.findFirst({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
      });

      if (!statement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Statement not found",
        });
      }

      if (!statement.storageUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Statement has no storage URL",
        });
      }

      // Update status to processing
      await ctx.prisma.statement.update({
        where: { id: statement.id },
        data: { status: StatementStatus.PROCESSING },
      });

      try {
        // Process the file with Vision AI
        const fileType = statement.filename.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
        const processingResult = await processUploadedFile(
          statement.storageUrl,
          fileType
        );

        if (!processingResult.success || !processingResult.data) {
          throw new Error(
            processingResult.error || "Failed to process statement text"
          );
        }

        // Check required fields in the data
        const { bankName, accounts, statementPeriodStartDate, statementPeriodEndDate } = processingResult.data;
        if (!bankName || !accounts || accounts.length === 0 || !statementPeriodStartDate || !statementPeriodEndDate) {
          throw new Error("Incomplete statement data: missing bank name, accounts, or statement period");
        }

                // Use statement period directly from the processed data
        const periodInfo = {
          start: new Date(statementPeriodStartDate),
          end: new Date(statementPeriodEndDate)
        };

        console.log(`Statement contains ${accounts.length} accounts`);
        
        // Update statement with period information
        await ctx.prisma.statement.update({
          where: { id: statement.id },
          data: {
            status: StatementStatus.COMPLETED,
            processedTimestamp: new Date(),
            periodStart: periodInfo.start,
            periodEnd: periodInfo.end,
          },
        });
        
        // Process all accounts from the statement
        for (let i = 0; i < accounts.length; i++) {
          const account = accounts[i];
          
          // Skip accounts without last 4 digits (can't reliably identify)
          if (!account.accountNumberLast4) {
            console.log(`Skipping account at index ${i} without last 4 digits`);
            continue;
          }
          
          // Map string account type to enum AccountType
          const mappedAccountType = account.accountType === "Advantage Plus Banking" ? "CHECKING" : 
                                   (account.accountType && ["CHECKING", "SAVINGS", "CREDIT", "INVESTMENT", "OTHER"].includes(account.accountType) ? 
                                     account.accountType as "CHECKING" | "SAVINGS" | "CREDIT" | "INVESTMENT" | "OTHER" : 
                                     "OTHER");
          
          // Try to find or create the bank account
          let bankAccount = await ctx.prisma.bankAccount.findFirst({
            where: {
              userId: ctx.session.user.id,
              financialInstitution: bankName,
              lastFourDigits: account.accountNumberLast4,
            },
          });
          
          if (bankAccount) {
            // Update existing account if needed
            if (account.metadata?.endingBalance !== undefined) {
              await ctx.prisma.bankAccount.update({
                where: { id: bankAccount.id },
                data: { balance: account.metadata.endingBalance.toString() },
              });
            }
          } else {
            // Create a new bank account
            bankAccount = await ctx.prisma.bankAccount.create({
              data: {
                userId: ctx.session.user.id,
                name: account.accountType || `${bankName} Account`,
                financialInstitution: bankName,
                accountType: mappedAccountType,
                lastFourDigits: account.accountNumberLast4,
                balance: account.metadata?.endingBalance !== undefined ? 
                         account.metadata.endingBalance.toString() : null,
              },
            });
          }
          
          // Connect this account to the statement
          await ctx.prisma.statement.update({
            where: { id: statement.id },
            data: {
              accounts: {
                connect: { id: bankAccount.id }
              }
            }
          });
        }

        // Return the updated statement
        const updatedStatement = await ctx.prisma.statement.findUnique({
          where: { id: statement.id }
        });
        
        return updatedStatement;
      } catch (error) {
        console.error("Error processing statement:", error);
        
        // Update statement with error
        const failedStatement = await ctx.prisma.statement.update({
          where: { id: statement.id },
          data: {
            status: StatementStatus.FAILED,
            errorMessage: error instanceof Error ? error.message : "Unknown error",
            processedTimestamp: new Date(),
          },
        });
        
        return failedStatement;
      }
    }),

  // Get a statement by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.session.user.id) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User ID is not available",
        });
      }

      const statement = await ctx.prisma.statement.findUnique({
              where: {
        id: input.id,
        userId: ctx.session.user.id, // Ensure user can only access their own statements
      },
      include: {
        accounts: true,
      },
      });

      if (!statement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Statement not found",
        });
      }

      return statement;
    }),
    
  // Link a statement to a bank account
  linkToAccount: protectedProcedure
    .input(z.object({ 
      statementId: z.string(),
      accountId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.id) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User ID is not available",
        });
      }
      
      // Verify statement belongs to user
      const statement = await ctx.prisma.statement.findFirst({
        where: {
          id: input.statementId,
          userId: ctx.session.user.id,
        },
      });
      
      if (!statement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Statement not found",
        });
      }
      
      // Verify account belongs to user
      const account = await ctx.prisma.bankAccount.findFirst({
        where: {
          id: input.accountId,
          userId: ctx.session.user.id,
        },
      });
      
      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bank account not found",
        });
      }
      
      // Link statement to account
      const updatedStatement = await ctx.prisma.statement.update({
        where: { id: input.statementId },
        data: { 
          accounts: {
            connect: { id: input.accountId }
          }
        },
      });
      
      return updatedStatement;
    }),
});
