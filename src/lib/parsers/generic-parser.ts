import { BankStatementParser, ProcessedStatementData } from './base-parser';
import { DocumentProcessor } from '../document-processor';

/**
 * Default generic bank statement parser
 * Used for banks that don't have a specific parser implemented
 */
export class GenericBankStatementParser extends BankStatementParser {
  private bankName: string;
  
  constructor(
    ocrResult: any, 
    filePath: string, 
    fileType: string, 
    bankName: string,
    documentProcessor?: DocumentProcessor
  ) {
    super(ocrResult, filePath, fileType, documentProcessor);
    this.bankName = bankName;
  }
  
  public async process(): Promise<ProcessedStatementData> {
    console.log(`Processing generic statement for: ${this.bankName}`);
    
    // For generic parser, we'll just use the basic data extraction
    const baseData = this.createBaseData(this.bankName);
    
    // Save the extracted data for analysis
    await this.saveExtractedData(baseData);
    
    return baseData;
  }
} 