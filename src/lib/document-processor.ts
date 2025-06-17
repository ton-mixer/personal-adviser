// Try to import DocumentAI, but provide mock if it's not available
import { protos } from "@google-cloud/documentai";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from 'dotenv';

let documentai: any;
let DocumentProcessorServiceClient: any;
let documentAiAvailable = true;

try {
  documentai = require("@google-cloud/documentai");
  DocumentProcessorServiceClient = documentai.DocumentProcessorServiceClient;
} catch (error) {
  console.warn("@google-cloud/documentai module not available, using mock implementation");
  documentAiAvailable = false;
  // Create a mock DocumentProcessorServiceClient
  DocumentProcessorServiceClient = class MockDocumentProcessorServiceClient {
    async processDocument() {
      console.warn("Using mock DocumentProcessorServiceClient - document processing not available");
      return [{ document: null }];
    }
  };
}

dotenv.config();

// Core type aliases from Google Cloud SDK
type IDocument = protos.google.cloud.documentai.v1.IDocument;
type IDocumentPage = protos.google.cloud.documentai.v1.Document.IPage;
type IDocumentEntity = protos.google.cloud.documentai.v1.Document.IEntity;
type IDocumentTable = protos.google.cloud.documentai.v1.Document.Page.ITable;
type IDocumentTableCell = protos.google.cloud.documentai.v1.Document.Page.Table.ITableCell;

// Environment configuration
const GCLOUD_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const GCLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION; 
const GCLOUD_OCR_PROCESSOR_ID = process.env.GOOGLE_DOCUMENT_AI_OCR_PROCESSOR_ID;
const GCLOUD_FORM_PROCESSOR_ID = process.env.GOOGLE_DOCUMENT_AI_FORM_PROCESSOR_ID;

// Define types for text blocks
export interface TextBlock {
  text: string;
  boundingBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

// Define the structure for a processed table
export interface ProcessedTable {
  tableIndex: number;
  headerCells: string[];
  rowCount: number;
  rows?: any[][]; // Optional: processed row data 
}

// Define the structure for a processed page
export interface ProcessedPage {
  pageNumber: number;
  textBlocks: TextBlock[];
  tables: ProcessedTable[]; // Will always be initialized as at least an empty array
  fullText: string;
  extractedData: Map<string, any>; // Template ID -> extracted data
}

// Define an extraction template
export interface ExtractionTemplate {
  id: string;
  patterns: Array<{
    regex: RegExp;
    type: string; 
    groupIndex?: number;
  }>;
}

/**
 * DocumentProcessor class for processing documents with Document AI
 * Provides centralized caching and extraction methods
 */
export class DocumentProcessor {
  private client: any = null;
  private processorName: string | null = null;
  
  // Document storage
  private document: IDocument | null = null;
  private documentHash: string | null = null; // Unique identifier based on file content
  private filePath: string | null = null;
  private mimeType: string | null = null;
  
  // Cache for processed pages
  private pageCache: Map<number, ProcessedPage> = new Map();
  
  /**
   * Initialize the Document AI client
   */
  private initDocumentAiClient(processorId: string): any {
    if (!documentAiAvailable) {
      console.warn("Document AI is not available in this environment. Using mock client.");
      this.client = new DocumentProcessorServiceClient();
      return this.client;
    }

    if (!GCLOUD_PROJECT_ID || !GCLOUD_LOCATION || !processorId) {
      throw new Error(
        "Google Cloud Document AI configuration (PROJECT_ID, LOCATION, or PROCESSOR_ID) is missing in environment variables."
      );
    }
  
    if (!this.client) {
      try {
        const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (!credentialsPath) {
          throw new Error(
            "GOOGLE_APPLICATION_CREDENTIALS environment variable not set."
          );
        }
  
        const fullPath = path.isAbsolute(credentialsPath)
          ? credentialsPath
          : path.join(process.cwd(), credentialsPath);
        
        if (!require('fs').existsSync(fullPath)) {
          throw new Error(`Credentials file not found at ${fullPath}`);
        }
  
        this.client = new DocumentProcessorServiceClient({});
        this.processorName = `projects/${GCLOUD_PROJECT_ID}/locations/${GCLOUD_LOCATION}/processors/${processorId}`;
        console.log(`Document AI client initialized for processor: ${this.processorName}`);
  
      } catch (error) {
        console.error("Failed to initialize Document AI client:", error);
        this.client = null; 
        this.processorName = null;
        throw error;
      }
    }
    return this.client;
  }
  
  /**
   * Process a document with Document AI
   * This is the main method that processes the entire document once
   */
  public async processDocument(filePath: string, mimeType: string, processorId?: string): Promise<boolean> {
    console.log(`Processing document: ${filePath}, MIME Type: ${mimeType}`);
    
    // If Document AI is not available, return a mock success but log warning
    if (!documentAiAvailable) {
      console.warn("Document AI is not available. Document processing will be skipped.");
      return false;
    }
    
    try {
      this.filePath = filePath;
      this.mimeType = mimeType;
      
      // Use the provided processor ID or fall back to OCR processor
      const actualProcessorId = processorId || GCLOUD_OCR_PROCESSOR_ID;
      if (!actualProcessorId) {
        console.error("No Document AI processor ID available. Check your environment variables.");
        return false;
      }
      
      // Include processor ID in logs
      console.log(`Using processor ID: ${actualProcessorId}`);
      
      // Generate a hash for the file
      const fileContent = await fs.readFile(filePath);
      this.documentHash = crypto
        .createHash('md5')
        .update(fileContent)
        .digest('hex');
      
      // Check if we already have this document cached on disk
      // Include the processor ID in the cache filename to avoid using cache from different processors
      const cacheDir = path.join(process.cwd(), '.cache');
      const cacheFile = path.join(cacheDir, `${this.documentHash}-${actualProcessorId}.json`);
      
      let cachedDocument = null;
      
      // Try to load from cache if exists
      try {
        if (require('fs').existsSync(cacheFile)) {
          console.log(`Found cached document processed with this processor: ${cacheFile}`);
          const cachedData = await fs.readFile(cacheFile, 'utf8');
          cachedDocument = JSON.parse(cachedData);
        }
      } catch (cacheError) {
        console.warn(`Cache read error, will process again: ${cacheError}`);
        cachedDocument = null;
      }
      
      if (cachedDocument) {
        // Use cached document
        this.document = cachedDocument;
        console.log(`Using cached document with ${this.document?.pages?.length || 0} pages`);
        return true;
      }
      
      // Process document with Document AI
      const client = this.initDocumentAiClient(actualProcessorId);
      if (!this.processorName) {
        console.error("Document AI processor is not configured.");
        return false;
      }
      
      const encodedImage = fileContent.toString("base64");
      
      const request = {
        name: this.processorName,
        rawDocument: {
          content: encodedImage,
          mimeType: mimeType,
        },
      };
      
      console.log(`Sending to Document AI processor: ${this.processorName}`);
      const [result] = await client.processDocument(request);
      
      if (!result.document) {
        console.error("No document returned from Document AI.");
        return false;
      }
      
      // Store the document
      this.document = result.document;
      
      // Save to cache for future use
      try {
        if (!require('fs').existsSync(cacheDir)) {
          await fs.mkdir(cacheDir, { recursive: true });
        }
        await fs.writeFile(
          cacheFile,
          JSON.stringify(this.document)
        );
        console.log(`Document cached to: ${cacheFile}`);
      } catch (saveError) {
        console.warn(`Failed to cache document: ${saveError}`);
      }
      
      console.log(`Successfully processed document with ${this.document?.pages?.length || 0} pages`);
      return true;
    
    } catch (error) {
      console.error("Error processing document:", error);
      return false;
    }
  }
  
  /**
   * Extract text blocks with their positions from a page
   */
  private extractTextBlocksWithPositions(page: IDocumentPage, fullText: string): TextBlock[] {
    const blocks: TextBlock[] = [];
    
    // Extract from paragraphs (preferred)
    if (page.paragraphs) {
      for (const paragraph of page.paragraphs) {
        if (paragraph.layout?.textAnchor?.textSegments && paragraph.layout.boundingPoly?.normalizedVertices) {
          const vertices = paragraph.layout.boundingPoly.normalizedVertices;
          if (vertices.length >= 4) {
            // Extract coordinates
            const x1 = vertices[0].x || 0;
            const y1 = vertices[0].y || 0;
            const x2 = vertices[2].x || 1;
            const y2 = vertices[2].y || 1;
            
            // Extract text
            let text = '';
            for (const segment of paragraph.layout.textAnchor.textSegments) {
              const startIndex = Number(segment.startIndex || 0);
              const endIndex = Number(segment.endIndex || 0);
              text += fullText.substring(startIndex, endIndex);
            }
            
            blocks.push({
              text,
              boundingBox: { x1, y1, x2, y2 }
            });
          }
        }
      }
    } 
    // Fall back to tokens if no paragraphs
    else if (page.tokens) {
      for (const token of page.tokens) {
        if (token.layout?.textAnchor?.textSegments && token.layout.boundingPoly?.normalizedVertices) {
          const vertices = token.layout.boundingPoly.normalizedVertices;
          if (vertices.length >= 4) {
            // Extract coordinates
            const x1 = vertices[0].x || 0;
            const y1 = vertices[0].y || 0;
            const x2 = vertices[2].x || 1;
            const y2 = vertices[2].y || 1;
            
            // Extract text
            let text = '';
            for (const segment of token.layout.textAnchor.textSegments) {
              const startIndex = Number(segment.startIndex || 0);
              const endIndex = Number(segment.endIndex || 0);
              text += fullText.substring(startIndex, endIndex);
            }
            
            blocks.push({
              text,
              boundingBox: { x1, y1, x2, y2 }
            });
          }
        }
      }
    }
    
    return blocks;
  }
  
  /**
   * Process and extract data from a specific page
   */
  public async processPage(pageNumber: number): Promise<ProcessedPage | null> {
    if (!this.document || !this.document.pages) {
      console.error("No document loaded. Call processDocument first.");
      return null;
    }
    
    // Check page bounds
    if (pageNumber < 1 || pageNumber > this.document.pages.length) {
      console.error(`Page ${pageNumber} is out of bounds. Document has ${this.document.pages.length} pages.`);
      return null;
    }
    
    // Check if page is already cached
    if (this.pageCache.has(pageNumber)) {
      console.log(`Using cached data for page ${pageNumber}`);
      return this.pageCache.get(pageNumber)!;
    }
    
    // Process page
    console.log(`\n--------------------- PROCESSING PAGE ${pageNumber}`);
    const pageIndex = pageNumber - 1; // Convert to 0-indexed
    const page = this.document.pages[pageIndex];
    const fullText = this.document.text || "";
    
    // Extract text blocks with positions
    const textBlocks = this.extractTextBlocksWithPositions(page, fullText);
    
    // Process tables if any - Form Parser should better detect tables
    const tables = page.tables || [];
    const processedTables: ProcessedTable[] = tables.map((table, index) => {
      const headerRow = table.headerRows && table.headerRows[0]?.cells ? 
        table.headerRows[0].cells.map(cell => {
          if (cell.layout?.textAnchor?.textSegments) {
            let headerText = '';
            for (const segment of cell.layout.textAnchor.textSegments) {
              const startIndex = Number(segment.startIndex || 0);
              const endIndex = Number(segment.endIndex || 0);
              headerText += fullText.substring(startIndex, endIndex);
            }
            return headerText.trim();
          }
          return '';
        }).filter(Boolean) : [];
      
      return {
        tableIndex: index,
        headerCells: headerRow,
        rowCount: table.bodyRows?.length || 0
      };
    });
    
    console.log(`Detected ${processedTables.length} tables on page ${pageNumber}`);
    
    // Create processed page object
    const processedPage: ProcessedPage = {
      pageNumber,
      textBlocks,
      tables: processedTables,
      fullText,
      extractedData: new Map()
    };
    
    // Cache the processed page
    this.pageCache.set(pageNumber, processedPage);
    
    // Save debugging info to file
    if (this.filePath) {
      const originalFilename = path.basename(this.filePath);
      const outputFilename = `page-${pageNumber}-${originalFilename}.json`;
      
      // Prepare for serialization
      const serializedPage = {
        pageNumber,
        textBlocks: textBlocks.map(block => ({
          text: block.text,
          position: {
            x1: Math.round(block.boundingBox.x1 * 1000) / 1000,
            y1: Math.round(block.boundingBox.y1 * 1000) / 1000,
            x2: Math.round(block.boundingBox.x2 * 1000) / 1000,
            y2: Math.round(block.boundingBox.y2 * 1000) / 1000
          }
        })),
        tables: processedTables
      };
    }
    
    return processedPage;
  }
  
  /**
   * Process a range of pages
   */
  public async processPageRange(startPage: number, endPage: number): Promise<ProcessedPage[]> {
    const results: ProcessedPage[] = [];
    
    for (let i = startPage; i <= endPage; i++) {
      const page = await this.processPage(i);
      if (page) {
        results.push(page);
      }
    }
    
    return results;
  }
  
  /**
   * Extract data from a page using a template
   */
  public async extractUsingTemplate(pageNumber: number, template: ExtractionTemplate): Promise<any> {
    // Get the processed page
    let page = this.pageCache.get(pageNumber);
    if (!page) {
      const processedPage = await this.processPage(pageNumber);
      if (!processedPage) {
        return null;
      }
      page = processedPage;
    }
    
    // Check if we already extracted data for this template
    if (page.extractedData.has(template.id)) {
      console.log(`Using cached extraction for template ${template.id} on page ${pageNumber}`);
      return page.extractedData.get(template.id);
    }
    
    console.log(`Extracting data using template ${template.id} from page ${pageNumber}`);
    
    // Extract data based on patterns
    const results: any = {};
    
    for (const pattern of template.patterns) {
      const matches: any[] = [];
      
      // Check text blocks for matches
      for (const block of page.textBlocks) {

        const regex = pattern.regex;
        const match = block.text.match(regex);
        
        if (match) {
          const value = pattern.groupIndex !== undefined ? match[pattern.groupIndex] : match[0];
          
          matches.push({
            value,
            text: block.text,
            position: block.boundingBox
          });
        }
      }
      
      results[pattern.type] = matches;
    }
    
    // Cache the extraction results
    page.extractedData.set(template.id, results);
    
    return results;
  }
  
  /**
   * Find tables that match specific criteria
   */
  public async findTables(pageNumber: number, criteria: { 
    requiredHeaders?: string[] 
  }): Promise<ProcessedTable[]> {
    // Get the processed page
    let page = this.pageCache.get(pageNumber);
    if (!page) {
      const processedPage = await this.processPage(pageNumber);
      if (!processedPage) {
        return [];
      }
      page = processedPage;
    }
    
    // Filter tables based on criteria
    return page.tables.filter(table => {
      if (criteria.requiredHeaders && criteria.requiredHeaders.length > 0) {
        // Check if all required headers exist (case-insensitive)
        const lowerHeaders = table.headerCells.map(h => h.toLowerCase());
        return criteria.requiredHeaders.every(header => 
          lowerHeaders.some(h => h.includes(header.toLowerCase()))
        );
      }
      return true;
    });
  }
  
  /**
   * Find the first page containing specific text
   */
  public async findFirstPageMatching(searchText: string): Promise<number | null> {
    if (!this.document || !this.document.pages) {
      console.error("No document loaded. Call processDocument first.");
      return null;
    }
    
    const regex = new RegExp(searchText, 'i');
    
    for (let i = 1; i <= this.document.pages.length; i++) {
      const page = await this.processPage(i);
      if (!page) continue;
      
      // Check if any text block matches
      const found = page.textBlocks.some(block => regex.test(block.text));
      if (found) {
        return i;
      }
    }
    
    return null;
  }
  
  /**
   * Get the total number of pages in the document
   */
  public getPageCount(): number {
    if (!this.document || !this.document.pages) {
      return 0;
    }
    return this.document.pages.length;
  }
  
  /**
   * Clear cache for a specific page
   */
  public clearPageCache(pageNumber: number): void {
    this.pageCache.delete(pageNumber);
  }
  
  /**
   * Clear all caches
   */
  public clearAllCaches(): void {
    this.pageCache.clear();
  }
} 