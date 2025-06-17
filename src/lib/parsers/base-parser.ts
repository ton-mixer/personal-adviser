import { protos } from "@google-cloud/documentai";
import { DocumentProcessor } from "../document-processor";
import { promises as fs } from 'fs';
import path from 'path';

// Core type aliases from Google Cloud SDK
type IDocument = protos.google.cloud.documentai.v1.IDocument;
type IDocumentPage = protos.google.cloud.documentai.v1.Document.IPage;
type IDocumentEntity = protos.google.cloud.documentai.v1.Document.IEntity;
type IDocumentTable = protos.google.cloud.documentai.v1.Document.Page.ITable;
type IDocumentTableCell = protos.google.cloud.documentai.v1.Document.Page.Table.ITableCell;

// Define transaction type for backward compatibility
export interface Transaction {
  date?: string | null;
  description?: string | null;
  amount?: number | null;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'OTHER';
  rawRowText?: string;
}

// Define account type for backward compatibility
export interface Account {
  accountNumberLast4: string;
  accountType?: string | null;
  pageReference?: number | null;  // Page number containing the account details
  // Organized transaction categories
  allTransactions?: {
    deposits: Transaction[];
    atmDebit: Transaction[];
    withdrawals: Transaction[];
    checks: Transaction[];
    fees: Transaction[];
    other: Transaction[];
    [key: string]: Transaction[];
  };
  metadata?: {
    beginningBalance?: number;
    endingBalance?: number;
    [key: string]: any;
  };
}

// Define ProcessedStatementData interface for backward compatibility
export interface ProcessedStatementData {
  bankName?: string | null;
  accounts: Account[];
  statementPeriodStartDate?: string | null;
  statementPeriodEndDate?: string | null;
  rawText: string; 
  entities: IDocumentEntity[];
  // For combined statements:
  totalBalance?: number; // For statements with a total balance
}

/**
 * Abstract base class for bank statement parsers
 */
export abstract class BankStatementParser {
  protected ocrResult: any;
  protected filePath: string;
  protected fileType: string;
  protected documentProcessor: DocumentProcessor | null = null;
  
  constructor(
    ocrResult: any, 
    filePath: string, 
    fileType: string,
    documentProcessor?: DocumentProcessor
  ) {
    this.ocrResult = ocrResult;
    this.filePath = filePath;
    this.fileType = fileType;
    this.documentProcessor = documentProcessor || null;
  }
  
  /**
   * Process the statement and return structured data
   */
  public abstract process(): Promise<ProcessedStatementData>;
  
  /**
   * Save the extracted data to a JSON file for analysis
   */
  protected async saveExtractedData(data: ProcessedStatementData): Promise<void> {
    if (!this.filePath) return;
    
    try {
      // Create a more useful representation for saving
      const extractedInfo = {
        bankName: data.bankName,
        statementPeriod: {
          start: data.statementPeriodStartDate,
          end: data.statementPeriodEndDate
        },
        accounts: data.accounts.map(account => ({
          accountNumberLast4: account.accountNumberLast4,
          accountType: account.accountType,
          transactionCount: account.allTransactions ? 
            Object.values(account.allTransactions).reduce(
              (sum, transactions) => sum + transactions.length, 0
            ) : 0,
          pageReference: account.pageReference,
          // Financial summary data
          beginningBalance: account.metadata?.beginningBalance,
          endingBalance: account.metadata?.endingBalance || account.metadata?.balance,
          // Transaction summary data
          depositsTotal: account.metadata?.depositsTotal,
          atmDebitTotal: account.metadata?.atmDebitTotal,
          checksTotal: account.metadata?.checksTotal,
          serviceFees: account.metadata?.serviceFees,
          otherSubtractions: account.metadata?.otherSubtractions,
          // Include the transactions by category
          transactions: account.allTransactions ? {
            deposits: account.allTransactions.deposits?.map(t => ({
              date: t.date,
              description: t.description,
              amount: t.amount
            })) || [],
            atmDebit: account.allTransactions.atmDebit?.map(t => ({
              date: t.date,
              description: t.description,
              amount: t.amount
            })) || [],
            withdrawals: account.allTransactions.withdrawals?.map(t => ({
              date: t.date,
              description: t.description,
              amount: t.amount
            })) || [],
            checks: account.allTransactions.checks?.map(t => ({
              date: t.date,
              description: t.description,
              amount: t.amount
            })) || [],
            fees: account.allTransactions.fees?.map(t => ({
              date: t.date,
              description: t.description,
              amount: t.amount
            })) || [],
            other: account.allTransactions.other?.map(t => ({
              date: t.date,
              description: t.description,
              amount: t.amount
            })) || []
          } : undefined
        })),
        isCombinedStatement: data.accounts.filter(acc => acc.pageReference !== undefined).length > 1,
        extractionTimestamp: new Date().toISOString()
      };
      
      // Determine filename
      const originalFilename = path.basename(this.filePath);
      const outputFilename = `tmp/extracted-data-${originalFilename}.json`;
      
      // Save to file
      await fs.writeFile(
        path.join(process.cwd(), outputFilename),
        JSON.stringify(extractedInfo, null, 2)
      );
      
      console.log(`Extracted data saved to ${outputFilename}`);
    } catch (error) {
      console.error("Error saving extracted data:", error);
    }
  }
  
  /**
   * Create base statement data structure
   */
  protected createBaseData(bankName: string): ProcessedStatementData {
    // Create a minimal empty structure - bank-specific parsers will populate all fields
    return {
      bankName: bankName,
      accounts: [],
      statementPeriodStartDate: null,
      statementPeriodEndDate: null,
      rawText: this.ocrResult.fullPageText,
      entities: []
    };
  }
} 