import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import dotenv from 'dotenv';
import { 
  BankStatementParser, 
  ProcessedStatementData,
  BankOfAmericaStatementParser,
  ChaseStatementParser,
  GenericBankStatementParser
} from './parsers';
import { DocumentProcessor } from './document-processor';

dotenv.config();

// Environment configuration
const GCLOUD_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const GCLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION; 
const GCLOUD_OCR_PROCESSOR_ID = process.env.GOOGLE_DOCUMENT_AI_OCR_PROCESSOR_ID;
const GCLOUD_FORM_PROCESSOR_ID = process.env.GOOGLE_DOCUMENT_AI_FORM_PROCESSOR_ID;

/**
 * Process a bank statement using Document AI Form Parser
 * This provides backward compatibility with the existing API
 */
export async function processStatement(
  filePath: string,
  fileType: string
): Promise<ProcessedStatementData | null> { 
  console.log(`Processing statement: ${filePath}, MIME Type: ${fileType}`);
  
  try {
    // Create and use a DocumentProcessor for initial document processing
    const processor = new DocumentProcessor();
    // Use Form Parser if available, with OCR as fallback
    const processorId = GCLOUD_FORM_PROCESSOR_ID || GCLOUD_OCR_PROCESSOR_ID;
    const success = await processor.processDocument(filePath, fileType, processorId);
    
    if (!success) {
      console.error(`Document processing failed.`);
      return null;
    }
    
    // Analyze the first page to identify the bank
    const firstPage = await processor.processPage(1);
    if (!firstPage) {
      console.error("Failed to process the first page");
      return null;
    }
    
    // Look for bank identifiers in the page text
    let bankName: string | null = null;
    const fullText = firstPage.fullText;
    
    // Check for common bank names
    const bankPatterns = [
      { name: 'Bank of America', pattern: /bank\s+of\s+america|bankofamerica|bofa/i },
      { name: 'Chase', pattern: /chase|jpmorgan/i },
      { name: 'Wells Fargo', pattern: /wells\s+fargo/i },
      { name: 'Citibank', pattern: /citi|citibank/i },
      { name: 'Capital One', pattern: /capital\s+one/i }
    ];
    
    for (const bank of bankPatterns) {
      if (bank.pattern.test(fullText)) {
        bankName = bank.name;
        console.log(`Detected bank: ${bankName}`);
        break;
      }
    }
    
    if (!bankName) {
      console.warn("Could not identify the bank from document content");
      bankName = "Unknown";
    }
    
    // Create the appropriate parser based on the bank
    let parser: BankStatementParser;
    
    switch (bankName) {
      case 'Bank of America':
        parser = new BankOfAmericaStatementParser(
          { success: true, fullPageText: fullText, visualBlocks: firstPage.textBlocks },
          filePath,
          fileType,
          processor
        );
        break;
      case 'Chase':
        parser = new ChaseStatementParser(
          { success: true, fullPageText: fullText, visualBlocks: firstPage.textBlocks },
          filePath,
          fileType,
          processor
        );
        break;
      default:
        // Generic processing for unrecognized banks
        parser = new GenericBankStatementParser(
          { success: true, fullPageText: fullText, visualBlocks: firstPage.textBlocks },
          filePath,
          fileType,
          bankName,
          processor
        );
        break;
    }
    
    // Process using the selected parser
    const processedData = await parser.process();
    return processedData;
    
  } catch (error) {
    console.error(`Error processing statement: ${error}`);
    return null;
  }
}
