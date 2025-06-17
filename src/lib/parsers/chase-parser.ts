import { BankStatementParser, ProcessedStatementData } from './base-parser';
import { DocumentProcessor } from '../document-processor';
import { dateExtractionTemplate, accountExtractionTemplate, chaseTemplate } from '../extraction-templates';

/**
 * Chase bank statement parser
 */
export class ChaseStatementParser extends BankStatementParser {
  public async process(): Promise<ProcessedStatementData> {
    console.log("Processing Chase statement");
    
    // Initialize document processor if not already done (use the one passed in constructor if available)
    if (!this.documentProcessor) {
      console.log("No DocumentProcessor instance was provided, creating a new one");
      this.documentProcessor = new DocumentProcessor();
      const success = await this.documentProcessor.processDocument(this.filePath, this.fileType);
      
      if (!success) {
        console.error("Failed to process document with document processor");
        // Fall back to base implementation
        return this.createBaseData('Chase');
      }
    } else {
      console.log("Using existing DocumentProcessor instance");
    }
    
    // Create a base structure
    const baseData = this.createBaseData('Chase');
    
    try {
      // Find the account summary page
      const summaryPageNumber = await this.findSummaryPage();
      if (summaryPageNumber) {
        console.log(`Found summary content on page ${summaryPageNumber}`);
        await this.processSummaryPage(summaryPageNumber, baseData);
      }
      
      // Find the transaction page
      const transactionPageNumber = await this.findTransactionPage();
      if (transactionPageNumber) {
        console.log(`Found transaction content on page ${transactionPageNumber}`);
        await this.processTransactionPage(transactionPageNumber, baseData);
      }
      
      // Save the extracted data for analysis
      await this.saveExtractedData(baseData);
      
      return baseData;
      
    } catch (error) {
      console.error("Error processing Chase statement:", error);
      return baseData;
    }
  }
  
  /**
   * Find the page containing account summary information
   */
  private async findSummaryPage(): Promise<number | null> {
    if (!this.documentProcessor) return null;
    
    // Chase typically has "Account Summary" section
    return await this.documentProcessor.findFirstPageMatching('account summary');
  }
  
  /**
   * Find the page containing transaction information
   */
  private async findTransactionPage(): Promise<number | null> {
    if (!this.documentProcessor) return null;
    
    // Chase transaction section headers
    return await this.documentProcessor.findFirstPageMatching('transactions|account activity');
  }
  
  /**
   * Process the summary page to extract account information
   */
  private async processSummaryPage(pageNumber: number, data: ProcessedStatementData): Promise<void> {
    if (!this.documentProcessor) return;
    
    // Extract data using templates
    const dateData = await this.documentProcessor.extractUsingTemplate(pageNumber, dateExtractionTemplate);
    const accountData = await this.documentProcessor.extractUsingTemplate(pageNumber, accountExtractionTemplate);
    const chaseData = await this.documentProcessor.extractUsingTemplate(pageNumber, chaseTemplate);
    
    // Extract dates and other data
    // Similar to BankOfAmericaStatementParser but with Chase-specific adjustments
    if (dateData['statement-period'] && dateData['statement-period'].length > 0) {
      const periodText = dateData['statement-period'][0].text;
      const match = periodText.match(/statement\s+period:?\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:to|-|through)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      
      if (match) {
        data.statementPeriodStartDate = match[1];
        data.statementPeriodEndDate = match[2];
        console.log(`Found statement period: ${match[1]} to ${match[2]}`);
      }
    }
  }
  
  /**
   * Process the transaction page to extract transaction data
   */
  private async processTransactionPage(pageNumber: number, data: ProcessedStatementData): Promise<void> {
    if (!this.documentProcessor) return;
    
    // Look for transaction tables
    const transactionTables = await this.documentProcessor.findTables(pageNumber, {
      requiredHeaders: ['date', 'description', 'amount']
    });
    
    if (transactionTables.length > 0) {
      console.log(`Found ${transactionTables.length} potential transaction tables on page ${pageNumber}`);
      // Extract transaction data
    }
  }
} 