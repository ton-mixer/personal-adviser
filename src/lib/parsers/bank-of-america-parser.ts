import { BankStatementParser, ProcessedStatementData, Account, Transaction } from './base-parser';
import { DocumentProcessor, ProcessedPage, ProcessedTable } from '../document-processor';
import { dateExtractionTemplate, accountExtractionTemplate, bankOfAmericaTemplate } from '../extraction-templates';

// Define custom transaction type to include ATM_DEBIT
export interface BofATransaction extends Omit<Transaction, 'type'> {
  date?: string | null;
  description?: string | null;
  amount?: number | null;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'OTHER' | 'ATM_DEBIT';
  rawRowText?: string;
  category?: string;
}

/**
 * Bank of America statement parser
 */
export class BankOfAmericaStatementParser extends BankStatementParser {
   public async process(): Promise<ProcessedStatementData> {
      console.log("\n------------------------ PROCESSING BANK OF AMERICA STATEMENT --------------------------")
      console.log("Processing Bank of America statement");
      
      // Initialize document processor if not already done (use the one passed in constructor if available)
      if (!this.documentProcessor) {
         console.log("No DocumentProcessor instance was provided, creating a new one");
         this.documentProcessor = new DocumentProcessor();
         const success = await this.documentProcessor.processDocument(this.filePath, this.fileType);
         
         if (!success) {
            console.error("Failed to process document with document processor");
            // Fall back to base implementation
            return this.createBaseData('Bank of America');
         }
      } else {
         console.log("Using existing DocumentProcessor instance");
      }
      
      // Create a base structure to populate
      const baseData = this.createBaseData('Bank of America');
      
      try {
         /**
          * The first page is either a combined statement summary page 
          * which list all accounts in the statement and what pages their details is on 
          * or Account Summary page if there is only one account in the statement
          * Let's first try to see if the statement first page is the combined statement summary page or Account Summary page
          */
         
         // Get the first page
         const firstPage = await this.documentProcessor.processPage(1);
         if (!firstPage) {
            console.error("Failed to process the first page");
            return baseData;
         }
         
         // Look for combined statement indicators
         const isCombinedStatement = await this.isCombinedStatementPage(firstPage);
         
         if (isCombinedStatement) {
            console.log("Detected combined statement with multiple accounts");
            await this.processCombinedStatementPage(firstPage, baseData);
         } else {
            // I want to process one account statement
            await this.processNonCombinedStatementPage(firstPage, baseData);
         }

         await this.processAccountDetailPages(baseData);
      
         // Save the extracted data for analysis
         await this.saveExtractedData(baseData);
      
         return baseData;
      
      } catch (error) {
         console.error("Error processing Bank of America statement:", error);
         return baseData;
      }
   }
  
   /**
      * Determine if the page is a combined statement summary page
      */
   private async isCombinedStatementPage(page: ProcessedPage): Promise<boolean> {
      // Combined statements typically have phrases like "Combined Statement" or references to multiple accounts
      const combinedStatementPatterns = [
         /your\s+combined\s+statement/i,
         /combined\s+statement/i,
         /your\s+deposit\s+accounts/i
      ];
      
      // Check for any of these indicators
      for (const pattern of combinedStatementPatterns) {
         if (page.textBlocks.some(block => pattern.test(block.text))) {
            return true;
         }
      }
      
      // Also check for multiple account references
      const accountReferences = page.textBlocks.filter(block => 
         /account\s+(?:number|#)?\s*[:.]?\s*[x\*]*(\d{4})/i.test(block.text)
      );
      
      // If we find multiple account numbers, it's likely a combined statement
      return accountReferences.length > 1;
   }
  
   /**
      * Process a combined statement page (with multiple accounts)
      */
   private async processCombinedStatementPage(page: ProcessedPage, data: ProcessedStatementData): Promise<void> {
      console.log("\n------------------------------------ PROCESSING COMBINED STATEMENT PAGE")
      if (!this.documentProcessor) return;
      
      // Extract data using templates
      const dateData = await this.documentProcessor.extractUsingTemplate(page.pageNumber, dateExtractionTemplate);
      if (!dateData) {
         console.error("Failed to extract date data");
         return;
      }

      // Extract statement period
      this.extractStatementPeriod(dateData, data);

      // Find account summary table using Document AI's table detection
      console.log("Looking for account summary table...");
      
      console.log(`Page has ${page.tables?.length || 0} tables detected by Form Parser`);
      
      // Check if we have any tables detected
      if (page.tables && page.tables.length > 0) {
         // Try to find a table that looks like an account summary table
         const accountSummaryTable = this.findAccountSummaryTable(page.tables);
         
         if (accountSummaryTable) {
            const headerText = accountSummaryTable.headerCells?.join(', ') || 'No headers';
            console.log(`Found account summary table with header cells: ${headerText}`);
            await this.extractAccountInfoFromTable(accountSummaryTable, page, data);
            return; // Successfully processed the table
         } else {
            console.log("No suitable account summary table found, falling back to text-based extraction");
         }
      } else {
         console.log("No tables detected on the page, falling back to text-based extraction");
      }
   }

   private async processNonCombinedStatementPage(page: ProcessedPage, data: ProcessedStatementData): Promise<void> {
      console.log("------------- PROCESSING NON-COMBINED STATEMENT PAGE")
      if (!this.documentProcessor) return;

      // Extract data using templates
      const dateData = await this.documentProcessor.extractUsingTemplate(page.pageNumber, dateExtractionTemplate);
      if (!dateData) {
         console.error("Failed to extract date data");
         return;
      }

      // Extract statement period
      this.extractStatementPeriod(dateData, data);

      await this.detectAccountsFromText(page, data);

      // Check if we already have an account, if not create one
      if (data.accounts.length === 0) {
         data.accounts.push({
            accountNumberLast4: 'unknown',
            accountType: null,
            allTransactions: {
               deposits: [],
               atmDebit: [],
               withdrawals: [],
               checks: [],
               fees: [],
               other: []
            }
         });
      }

       // Get the first account from the data
       const account = data.accounts[0];

       // Set the page reference to 1 for this account (non-combined statement)
       account.pageReference = 1;
   }
  
   /**
      * Detect accounts from text blocks in the page
      */
   private async detectAccountsFromText(page: ProcessedPage, data: ProcessedStatementData): Promise<void> {
      // Bank of America specific account number regex - captures the last 4 digits
      const accountNumberRegex = /account\s+(?:number|#)?\s*[:.]?\s*(?:[x\*]*\d{4}\s*)+([0-9]{4})/i;
      
      // Bank of America specific account types
      const accountTypePatterns = [
         {regex: /adv\s+plus\s+banking/i, type: 'Advantage Plus Banking'},
      ];

      const account: Account = {
         accountNumberLast4: 'unknown',
         accountType: null,
         allTransactions: {
            deposits: [],
            atmDebit: [],
            withdrawals: [],
            checks: [],
            fees: [],
            other: []
         }
      }
      
      for (const block of page.textBlocks) {
         const accountMatch = block.text.match(accountNumberRegex);
         if (accountMatch) {
            account.accountNumberLast4 = accountMatch[1];
         }

         let accountType: string | null = null;
         for (const pattern of accountTypePatterns) {

            if (pattern.regex.test(block.text)) {
               console.log("Found account type", pattern.type);
               accountType = pattern.type;
               break;
            }
         }

         if (accountType) {
            account.accountType = accountType;
         }
      }

      if (account.accountNumberLast4 !== 'unknown' && account.accountType) {
         data.accounts.push(account);
         console.log(`Detected account from text: ${account.accountNumberLast4}, type: ${account.accountType || 'unknown'}`);
      }
   }
  
  /**
   * Find a table that looks like an account summary table
   */
  private findAccountSummaryTable(tables: ProcessedTable[]): ProcessedTable | null {
    // Look for tables with appropriate headers for an account summary
    for (const table of tables) {
      const headers = table.headerCells.map(h => h.toLowerCase());
      
      // Check for common account summary table headers
      const hasAccountColumn = headers.some(h => 
        h.includes('account') || h.includes('deposit') || h.includes('banking')
      );
      
      const hasNumberColumn = headers.some(h => 
        h.includes('number') || h.includes('account/plan') || h.includes('acct')
      );
      
      const hasBalanceColumn = headers.some(h => 
        h.includes('balance') || h.includes('amount')
      );
      
      const hasDetailsColumn = headers.some(h => 
        h.includes('page') || h.includes('details')
      );
      
      // If we find at least 2 of these columns, it's likely the account summary table
      const matchCount = [hasAccountColumn, hasNumberColumn, hasBalanceColumn, hasDetailsColumn]
        .filter(Boolean).length;
      
      if (matchCount >= 2) {
        return table;
      }
    }
    
    return null;
  }
  
  /**
   * Extract account information from a detected table
   */
  private async extractAccountInfoFromTable(table: ProcessedTable, page: ProcessedPage, data: ProcessedStatementData): Promise<void> {
    if (!this.documentProcessor) return;
    
    const boundingConstraints = {
      topAnchor: "Your deposit accounts",
      bottomAnchor: "Total balance"
    }
    const fullTableData = await this.extractFullTableData(page.pageNumber, table, boundingConstraints, {
      topBoundaryMode: 'exclusive',
      bottomBoundaryMode: 'exclusive',
      includeAnchors: true
    });
    
    if (!fullTableData || !fullTableData.rows || fullTableData.rows.length === 0) {
      console.log("Failed to extract complete table data");
      return;
    }
    
    console.log(`Extracted ${fullTableData.rows.length} rows from account summary table`);
    
    // Extract column indices based on headers
    const headers = table.headerCells.map(h => h.toLowerCase());
    const accountNameIdx = headers.findIndex(h => h.includes('account') || h.includes('deposit') || h.includes('banking'));
    const accountNumIdx = headers.findIndex(h => h.includes('number') || h.includes('account/plan') || h.includes('acct'));
    const balanceIdx = headers.findIndex(h => h.includes('balance') || h.includes('amount'));
    const pageRefIdx = headers.findIndex(h => h.includes('page') || h.includes('details'));
    
    // Initialize accounts array
    data.accounts = [];
    
    // Process regular account rows (exclude any total/summary rows)
    let totalBalance = 0;
    for (let i = 0; i < fullTableData.rows.length; i++) {
      const row = fullTableData.rows[i];
      
      // Skip likely header or summary rows
      if (row.some(cell => cell.toLowerCase().includes('total'))) {
        // This is likely a summary row - try to extract total balance
        if (balanceIdx >= 0 && balanceIdx < row.length) {
          const totalBalanceText = row[balanceIdx];
          const balanceMatch = totalBalanceText.match(/\$?([\d,]+\.\d{2})/);
          if (balanceMatch) {
            totalBalance = parseFloat(balanceMatch[1].replace(',', ''));
            console.log(`Found total balance: $${totalBalance}`);
          }
        }
        continue;
      }

      // Define header keywords to identify and potentially filter out
      const headerKeywords = [
        'your deposit accounts',
        'account/plan number',
        'ending balance',
        'details on'
      ];
      
      // Check if row contains header information
      const containsHeaderInfo = row.some(cell => 
        headerKeywords.some(keyword => cell.toLowerCase().includes(keyword.toLowerCase()))
      );
      
      // Check if row contains account information (account number with digits)
      const containsAccountInfo = row.some(cell => 
        /\d{4}/.test(cell) || // Has a 4-digit sequence
        (cell.includes('*') && /\d+/.test(cell)) // Has asterisks and digits (masked account)
      );
      
      // If row is only a header with no account info, skip it
      if (containsHeaderInfo && !containsAccountInfo) {
        console.log("Skipping pure header row");
        continue;
      }
      
      let filteredRow = row;
      // If row contains both header and account info, filter out header cells
      if (containsHeaderInfo && containsAccountInfo) {
        console.log("Found mixed header/account row - filtering header content");
        // Create filtered row without header content
        filteredRow = row.map(cell => {
          // For each cell, check if it's a pure header cell
          if (headerKeywords.some(keyword => 
            cell.toLowerCase() === keyword.toLowerCase() ||
            cell.toLowerCase().trim() === keyword.toLowerCase()
          )) {
            return ""; // Replace pure header cells with empty string
          }
          return cell; // Keep other cells
        }).filter(cell => cell.trim() !== ""); // Remove empty cells
      }
      
      // Extract account information
      const accountName = accountNameIdx >= 0 && accountNameIdx < filteredRow.length ? filteredRow[accountNameIdx] : null;
      const accountNumber = accountNumIdx >= 0 && accountNumIdx < filteredRow.length ? filteredRow[accountNumIdx] : null;
      const balanceText = balanceIdx >= 0 && balanceIdx < filteredRow.length ? filteredRow[balanceIdx] : null;
      const pageRefText = pageRefIdx >= 0 && pageRefIdx < filteredRow.length ? filteredRow[pageRefIdx] : null;
      
      if (!accountNumber) continue; // Skip if no account number
      
      // Extract last 4 digits of account number
      const last4 = accountNumber.replace(/\D/g, '').slice(-4);
      
      // Extract balance amount
      let balance: number | undefined = undefined;
      if (balanceText) {
        const balanceMatch = balanceText.match(/\$?([\d,]+\.\d{2})/);
        if (balanceMatch) {
          balance = parseFloat(balanceMatch[1].replace(',', ''));
        }
      }
      
      // Extract page reference
      let pageReference: number | undefined = undefined;
      if (pageRefText) {
        const pageMatch = pageRefText.match(/page\s+(\d+)/i);
        if (pageMatch) {
          pageReference = parseInt(pageMatch[1], 10);
        }
      }
      
      // Add to processed data
      data.accounts.push({
        accountNumberLast4: last4,
        accountType: accountName,
        allTransactions: {
          deposits: [],
          atmDebit: [],
          withdrawals: [],
          checks: [],
          fees: [],
          other: []
        },
        pageReference: pageReference,
        metadata: {
          endingBalance: balance
        }
      });
      
      console.log(`Extracted account from table: ${last4}, type: ${accountName || 'unknown'}, ending balance: ${balance}, page: ${pageReference}`);
    }
    
    // Store total balance
    data.totalBalance = totalBalance > 0 ? totalBalance : undefined;
  }
  
  /**
   * Extract full table data including rows
   */
  private async extractFullTableData(
    pageNumber: number, 
    table: ProcessedTable,
    boundingConstraints?: {
      topAnchor?: string;    // Text that appears above the table
      bottomAnchor?: string; // Text that appears below the table
      // Or directly specify coordinates
      y1?: number;  // Top boundary
      y2?: number;  // Bottom boundary
    },
    boundaryOptions?: {
      topBoundaryMode?: 'inclusive' | 'exclusive'; // How to treat the top boundary
      bottomBoundaryMode?: 'inclusive' | 'exclusive'; // How to treat the bottom boundary
      includeAnchors?: boolean; // Whether to include the anchor blocks themselves
    }
  ): Promise<{ headers: string[], rows: string[][] } | null> {
    if (!this.documentProcessor) return null;
      console.log("Attempting to extract full table data");
    
    try {
      // Get the page
      const page = await this.documentProcessor.processPage(pageNumber);
      if (!page) return null;
      
      // Filter text blocks that are within our constraints
      let filteredBlocks = [...page.textBlocks];
      
      // Set default boundary modes if not specified
      const topMode = boundaryOptions?.topBoundaryMode || 'inclusive';
      const bottomMode = boundaryOptions?.bottomBoundaryMode || 'inclusive';
      const includeAnchors = boundaryOptions?.includeAnchors ?? false;
      
      if (boundingConstraints) {
        // If we have anchor words, find their positions
        if (boundingConstraints.topAnchor) {
          const topBlock = page.textBlocks.find(block => 
            block.text.includes(boundingConstraints.topAnchor!));
          if (topBlock) {
            // If we want to include the anchor, use its top, otherwise use its bottom
            boundingConstraints.y1 = includeAnchors ? 
              topBlock.boundingBox.y1 : // Top of the anchor
              topBlock.boundingBox.y2;  // Bottom of the anchor
          }
        }
        
        if (boundingConstraints.bottomAnchor) {
          const bottomBlock = page.textBlocks.find(block => 
            block.text.includes(boundingConstraints.bottomAnchor!));
          if (bottomBlock) {
            // If we want to include the anchor, use its bottom, otherwise use its top
            boundingConstraints.y2 = includeAnchors ? 
              bottomBlock.boundingBox.y2 : // Bottom of the anchor
              bottomBlock.boundingBox.y1;  // Top of the anchor
          }
        }
        
        // Filter blocks within the vertical range
        if (boundingConstraints.y1 !== undefined || boundingConstraints.y2 !== undefined) {
          filteredBlocks = filteredBlocks.filter(block => {
            const blockCenterY = (block.boundingBox.y1 + block.boundingBox.y2) / 2;
            
            // Apply top boundary based on mode
            const topCondition = boundingConstraints.y1 === undefined ? true :
              topMode === 'inclusive' ? 
                blockCenterY >= boundingConstraints.y1 : 
                blockCenterY > boundingConstraints.y1;
                
            // Apply bottom boundary based on mode
            const bottomCondition = boundingConstraints.y2 === undefined ? true :
              bottomMode === 'inclusive' ? 
                blockCenterY <= boundingConstraints.y2 : 
                blockCenterY < boundingConstraints.y2;
                
            return topCondition && bottomCondition;
          });
        }
      }
      
      // Sort text blocks from top to bottom
      const sortedBlocks = [...filteredBlocks].sort((a, b) => 
        (a.boundingBox.y1 + a.boundingBox.y2) / 2 - (b.boundingBox.y1 + b.boundingBox.y2) / 2
      );

      // Group blocks into rows based on y-position
      const rowGroups: any[][] = [];
      let currentRow: any[] = [];
      let lastY = -1;
      
      for (const block of sortedBlocks) {
        const centerY = (block.boundingBox.y1 + block.boundingBox.y2) / 2;
        
        // If this block is significantly below the last one, start a new row
        if (lastY >= 0 && centerY - lastY > 0.02) {
          if (currentRow.length > 0) {
            rowGroups.push(currentRow);
            currentRow = [];
          }
        }
        
        currentRow.push(block);
        lastY = centerY;
      }
      
      // Add the last row if not empty
      if (currentRow.length > 0) {
        rowGroups.push(currentRow);
      }
      
      // For each row, sort blocks from left to right and extract text
      const rows: string[][] = [];
      for (const rowGroup of rowGroups) {
        // Skip rows with too few blocks
        if (rowGroup.length < 2) continue;
        
        // Sort blocks from left to right
        const sortedRowBlocks = rowGroup.sort((a, b) => 
          (a.boundingBox.x1 + a.boundingBox.x2) / 2 - (b.boundingBox.x1 + b.boundingBox.x2) / 2
        );
        
        // Extract text from blocks
        const rowTexts = sortedRowBlocks.map(block => block.text);
        rows.push(rowTexts);
      }
      
      // Make sure we have headers - if not, use empty array
      const headers = table.headerCells || [];

      return {
        headers,
        rows
      };
      
    } catch (error) {
      console.error("Error extracting full table data:", error);
      return null;
    }
  }
  
  /**
   * Extract full table data for transaction tables (deposits and withdrawals)
   * This implementation sorts and groups all text blocks first, then filters by constraints
   */
  private async extractFullTableDataForTransactions(
    pageNumber: number, 
    table: ProcessedTable,
    boundingConstraints?: {
      topAnchor?: string;    // Text that appears above the table
      bottomAnchor?: string; // Text that appears below the table
      // Or directly specify coordinates
      y1?: number;  // Top boundary
      y2?: number;  // Bottom boundary
    },
    boundaryOptions?: {
      topBoundaryMode?: 'inclusive' | 'exclusive'; // How to treat the top boundary
      bottomBoundaryMode?: 'inclusive' | 'exclusive'; // How to treat the bottom boundary
      includeAnchors?: boolean; // Whether to include the anchor blocks themselves
    }
  ): Promise<{ headers: string[], rows: string[][] } | null> {
    if (!this.documentProcessor) return null;
      console.log("Attempting to extract full table data for transactions");
    
    try {
      // Get the page
      const page = await this.documentProcessor.processPage(pageNumber);
      if (!page) return null;

      // console.log("page.textBlocks", page.textBlocks)
      
      // 1. Sort all text blocks from top to bottom first
      const sortedBlocks = [...page.textBlocks].sort((a, b) => 
        (a.boundingBox.y1 + a.boundingBox.y2) / 2 - (b.boundingBox.y1 + b.boundingBox.y2) / 2
      );

      // 2. Group blocks into rows based on y-position
      const rowGroups: any[][] = [];
      let currentRow: any[] = [];
      let lastY = -1;
      
      for (const block of sortedBlocks) {
        const centerY = (block.boundingBox.y1 + block.boundingBox.y2) / 2;
        
        // If this block is significantly below the last one, start a new row
        if (lastY >= 0 && centerY - lastY > 0.02) {
          if (currentRow.length > 0) {
            rowGroups.push(currentRow);
            currentRow = [];
          }
        }
        
        currentRow.push(block);
        lastY = centerY;
      }
      
      // Add the last row if not empty
      if (currentRow.length > 0) {
        rowGroups.push(currentRow);
      }
      
      // 3. Apply bounding constraints to filter rows
      let filteredRowGroups = [...rowGroups];
      if (boundingConstraints) {
        // Set default boundary modes if not specified
        const topMode = boundaryOptions?.topBoundaryMode || 'inclusive';
        const bottomMode = boundaryOptions?.bottomBoundaryMode || 'inclusive';
        const includeAnchors = boundaryOptions?.includeAnchors ?? false;
        
        // If we have anchor words, find their positions
        if (boundingConstraints.topAnchor) {
          console.log("Looking for topAnchor:", boundingConstraints.topAnchor);
          
          // Create temporary rows for anchor detection
          const tempRows = rowGroups.map(rowGroup => 
            rowGroup.map(block => block.text)
          );
          
          // Check each row to find one containing the top anchor
          let anchorRowIndex = -1;
          
          for (let i = 0; i < tempRows.length; i++) {
            const row = tempRows[i];
            const rowText = row.join(' ');
            
            if (rowText.toLowerCase().includes(boundingConstraints.topAnchor.toLowerCase())) {
              console.log(`Found topAnchor in row ${i}`);
              
              // Check if the next row is a header row (contains at least 3 of 4 header keywords)
              if (i < tempRows.length - 1) {
                const nextRow = tempRows[i + 1];
                const nextRowText = nextRow.join(' ').toLowerCase();
                const currentRowText = rowText.toLowerCase();
                                
                const headerKeywords = ["date", "description", "transaction description", "amount"];
                let matchCount = 0;
                
                for (const keyword of headerKeywords) {
                  if (nextRowText.includes(keyword)) {
                    matchCount++;
                  }

                  if (currentRowText.includes(keyword)) {
                    matchCount++;
                  }
                }
                
                console.log(`Header match count: ${matchCount}`);
                
                // If the next row has at least 3 of the 4 header keywords, we found our table start
                if (matchCount >= 3) {
                  console.log(`Found a good header row at ${i + 1}, setting anchor row to ${i}`);
                  anchorRowIndex = i;
                  break;
                }
              }
            }
          }
          
          // Calculate y coordinates for boundary if we found the anchor row
          if (anchorRowIndex >= 0 && anchorRowIndex < rowGroups.length) {
            const anchorRowGroup = rowGroups[anchorRowIndex - 1];
            const rowBlocks = anchorRowGroup;
            
            // Calculate average y position for the row
            let avgY1 = 0;
            let avgY2 = 0;
            
            for (const block of rowBlocks) {
              avgY1 += block.boundingBox.y1;
              avgY2 += block.boundingBox.y2;
            }
            
            avgY1 = avgY1 / rowBlocks.length;
            avgY2 = avgY2 / rowBlocks.length;
            
            console.log(`Setting top boundary from row ${anchorRowIndex}: y1=${avgY1}, y2=${avgY2}`);
            
            // If we want to include the anchor, use its top, otherwise use its bottom
            boundingConstraints.y1 = includeAnchors ? avgY1 : avgY2;
          } else {
            console.log("No suitable anchor row found, returning null");
            return null;
          }
        }
        
        if (boundingConstraints.bottomAnchor) {
          console.log("Looking for bottomAnchor:", boundingConstraints.bottomAnchor);
          
          // Create temporary rows for anchor detection
          const tempRows = rowGroups.map(rowGroup => 
            rowGroup.map(block => block.text)
          );
          
          // Check each row to find one containing the bottom anchor
          let anchorRowIndex = -1;
          
          for (let i = 0; i < tempRows.length; i++) {
            const row = tempRows[i];
            const rowText = row.join(' ');
            
            if (rowText.includes(boundingConstraints.bottomAnchor)) {
              anchorRowIndex = i;
              console.log(`Found bottomAnchor in row ${i}`);
              break;
            }
          }
          
          // Calculate y coordinates for boundary if we found the anchor row
          if (anchorRowIndex >= 0 && anchorRowIndex < rowGroups.length) {
            const anchorRowGroup = rowGroups[anchorRowIndex];
            const rowBlocks = anchorRowGroup;
            
            // Calculate average y position for the row
            let avgY1 = 0;
            let avgY2 = 0;
            
            for (const block of rowBlocks) {
              avgY1 += block.boundingBox.y1;
              avgY2 += block.boundingBox.y2;
            }
            
            avgY1 = avgY1 / rowBlocks.length;
            avgY2 = avgY2 / rowBlocks.length;
            
            console.log(`Setting bottom boundary from row ${anchorRowIndex}: y1=${avgY1}, y2=${avgY2}`);
            
            // If we want to include the anchor, use its bottom, otherwise use its top
            boundingConstraints.y2 = includeAnchors ? avgY2 : avgY1;
          } else {
            console.log("No suitable bottom anchor row found, returning null");
            return null;
          }
        }
        
        // Filter rowGroups based on their average y-position
        if (boundingConstraints.y1 !== undefined || boundingConstraints.y2 !== undefined) {
          filteredRowGroups = rowGroups.filter(rowGroup => {
            // Calculate the average center Y position for this row
            const avgCenterY = rowGroup.reduce((sum, block) => 
              sum + (block.boundingBox.y1 + block.boundingBox.y2) / 2, 0) / rowGroup.length;
            
            // Apply top boundary based on mode
            const topCondition = boundingConstraints.y1 === undefined ? true :
              topMode === 'inclusive' ? 
                avgCenterY >= boundingConstraints.y1 : 
                avgCenterY > boundingConstraints.y1;
                
            // Apply bottom boundary based on mode
            const bottomCondition = boundingConstraints.y2 === undefined ? true :
              bottomMode === 'inclusive' ? 
                avgCenterY <= boundingConstraints.y2 : 
                avgCenterY < boundingConstraints.y2;
                
            return topCondition && bottomCondition;
          });
        }
      }
      
      // 4. For each filtered row, sort blocks from left to right and extract text
      let rows: string[][] = [];
      for (const rowGroup of filteredRowGroups) {
        // Skip rows with too few blocks
        if (rowGroup.length < 1) continue;
        
        // Sort blocks from left to right
        const sortedRowBlocks = rowGroup.sort((a, b) => 
          (a.boundingBox.x1 + a.boundingBox.x2) / 2 - (b.boundingBox.x1 + b.boundingBox.x2) / 2
        );
        
        // Extract text from blocks
        const rowTexts = sortedRowBlocks.map(block => block.text);
        rows.push(rowTexts);
      }
      
      // Make sure we have headers - if not, use empty array
      const headers = table.headerCells || [];

      return {
        headers,
        rows
      };
      
    } catch (error) {
      console.error("Error extracting full table data for transactions:", error);
      return null;
    }
  }
  
  /** 
   * Process individual account pages referenced in a combined statement
   */
  private async processAccountDetailPages(data: ProcessedStatementData): Promise<void> {
    console.log("\n------------------------------------ PROCESSING ACCOUNT DETAIL PAGES")
    if (!this.documentProcessor) return;

    // If there is more than one account, we need to process each account separately
    // Each account starts from its start page and ends on the page before the next account start page
    
    // Sort the accounts by their page reference to determine page ranges
    const sortedAccounts = [...data.accounts]
      .filter(acc => acc.pageReference !== undefined)
      .sort((a, b) => (a.pageReference || 0) - (b.pageReference || 0));
    
    if (sortedAccounts.length === 0) return;
    
    // Total number of pages in the document
    const totalPages = this.documentProcessor.getPageCount();
    
    // Process each account with its page range
    for (let i = 0; i < sortedAccounts.length; i++) {
      const account = sortedAccounts[i];
      if (!account.pageReference) continue;
      
      // Determine end page for this account:
      // - If this is the last account, use the last page of the document
      // - Otherwise, use the page before the next account's start page
      const startPage = account.pageReference;
      let endPage: number;
      
      if (i < sortedAccounts.length - 1) {
        // Not the last account, use the page before the next account's start page
        const nextAccountStartPage = sortedAccounts[i + 1].pageReference || totalPages;
        endPage = nextAccountStartPage - 1;
      } else {
        // Last account, use the last page of the document
        endPage = totalPages;
      }
            
      // Process the account statement with the determined page range
      await this.processAccountStatement(
        account,
        { startPage, endPage },
        data
      );
    }
  }

  /**
   * Process individual account statement pages
   * Extracts data from the three primary tables: Account Summary, Deposits, and Withdrawals
   */
  private async processAccountStatement(
    account: Account,
    pageRange: { startPage: number, endPage?: number },
    data: ProcessedStatementData
  ): Promise<void> {
    if (!this.documentProcessor) return;
    
    // If no end page specified, process until we find a page without relevant content
    const startPage = pageRange.startPage;
    const endPage = pageRange.endPage || this.documentProcessor.getPageCount();
    
    console.log(`Processing account ${account.accountNumberLast4} statement from page ${startPage} to ${endPage}`);
    
    // Get the first page to start processing
    const firstPage = await this.documentProcessor.processPage(startPage);
    if (!firstPage) {
      console.error(`Failed to process page ${startPage}`);
      return;
    }
    
    // Process Account Summary Table
    await this.processAccountSummaryTable(firstPage, account);
    
    // Process transaction tables (deposits and withdrawals) across all relevant pages
    await this.processTransactionTables(startPage, endPage, account);
  
  }
  
  /**
   * Process the Account Summary table on an account page
   */
  private async processAccountSummaryTable(page: ProcessedPage, accountOrData: Account | ProcessedStatementData): Promise<void> {
    console.log("------------ PROCESSING ACCOUNT SUMMARY TABLE")
    console.log(`Looking for Account Summary table on page ${page.pageNumber}`);
    
    // Determine if we're working with an Account or ProcessedStatementData
    const isAccount = 'accountNumberLast4' in accountOrData;
    
    // Define anchors for the Account Summary table
    const summaryBounds = {
      topAnchor: "Account summary",
      bottomAnchor: "Ending balance on"
    };
    
    // Try to find the account summary table using Document AI's table detection
    const summaryTables = page.tables.filter(table => {
      const headerText = table.headerCells.join(' ').toLowerCase();
      return headerText.includes('beginning balance') || 
             headerText.includes('deposits') || 
             headerText.includes('withdrawals');
    });
    
    if (summaryTables.length > 0) {
      console.log(`Found ${summaryTables.length} potential Account Summary tables`);
      const summaryTable = summaryTables[0]; // Use the first matching table
      
      // Extract the full table data
      const fullTableData = await this.extractFullTableData(page.pageNumber, summaryTable, summaryBounds, {
        topBoundaryMode: 'inclusive',
        bottomBoundaryMode: 'exclusive',
        includeAnchors: true
      });
      
      if (fullTableData && fullTableData.rows) {
        // If we have an Account, update it directly
        if (isAccount) {
          this.extractAccountSummaryInfo(fullTableData.rows, accountOrData as Account);
        } 
        // Otherwise, if we're dealing with ProcessedStatementData, update the first account
        else {
          const data = accountOrData as ProcessedStatementData;
          if (data.accounts.length > 0) {
            this.extractAccountSummaryInfo(fullTableData.rows, data.accounts[0]);
          }
        }
      }
    } else {
      console.log("No Account Summary table found")
    }
  }
  
  /**
   * Extract account summary information from table rows
   */
  private extractAccountSummaryInfo(rows: string[][], account: Account): void {
    // Look for key information in the account summary
    let beginningBalance: number | null = null;
    let endingBalance: number | null = null;
    
    // Additional financial summary data
    let depositsTotal: number | null = null;
    let atmDebitTotal: number | null = null;
    let checksTotal: number | null = null;
    let serviceFees: number | null = null;
    let otherSubtractions: number | null = null;
    
    // First try key-value pair extraction
    for (const row of rows) {
      const rowText = row.join(' ').toLowerCase();
      
      // Key-value pair extraction for beginning balance
      const beginBalanceMatch = rowText.match(/(beginning\s+balance|opening\s+balance)(?:[\s\n\r]*[:=]?[\s\n\r]*|[^a-zA-Z0-9]*|[\s\n\r]*-[\s\n\r]*)[\$]?([\d,]+\.\d{2})/i);
      if (beginBalanceMatch) {
        beginningBalance = parseFloat(beginBalanceMatch[2].replace(/,/g, ''));
        continue;
      }
      
      // Key-value pair extraction for ending balance
      const endBalanceMatch = rowText.match(/(ending\s+balance|closing\s+balance)(?:[\s\n\r]*[:=]?[\s\n\r]*|[^a-zA-Z0-9]*|[\s\n\r]*-[\s\n\r]*)[\$]?([\d,]+\.\d{2})/i);
      if (endBalanceMatch) {
        endingBalance = parseFloat(endBalanceMatch[2].replace(/,/g, ''));
        continue;
      }
      
      // Extract deposits and other additions
      const depositsMatch = rowText.match(/(deposits\s+and\s+other\s+additions|total\s+deposits)(?:[\s\n\r]*[:=]?[\s\n\r]*|[^a-zA-Z0-9]*|[\s\n\r]*-[\s\n\r]*)[\$]?([\d,]+\.\d{2})/i);
      if (depositsMatch) {
        depositsTotal = parseFloat(depositsMatch[2].replace(/,/g, ''));
        continue;
      }
      
      // Extract ATM and debit card transactions
      const atmDebitMatch = rowText.match(/(atm\s+and\s+debit\s+card\s+(?:transactions|subtractions|withdrawals))(?:[\s\n\r]*[:=]?[\s\n\r]*|[^a-zA-Z0-9]*|[\s\n\r]*-[\s\n\r]*)[\$]?([\d,]+\.\d{2})/i);
      if (atmDebitMatch) {
        atmDebitTotal = parseFloat(atmDebitMatch[2].replace(/,/g, ''));
        continue;
      }
      
      // Extract checks
      const checksMatch = rowText.match(/(checks(\s+paid)?|total\s+checks)(?:[\s\n\r]*[:=]?[\s\n\r]*|[^a-zA-Z0-9]*|[\s\n\r]*-[\s\n\r]*)[\$]?([\d,]+\.\d{2})/i);
      if (checksMatch) {
        checksTotal = parseFloat(checksMatch[checksMatch.length - 1].replace(/,/g, ''));
        continue;
      }
      
      // Extract service fees
      const feesMatch = rowText.match(/(service\s+fees|total\s+fees)(?:[\s\n\r]*[:=]?[\s\n\r]*|[^a-zA-Z0-9]*|[\s\n\r]*-[\s\n\r]*)[\$]?([\d,]+\.\d{2})/i);
      if (feesMatch) {
        serviceFees = parseFloat(feesMatch[2].replace(/,/g, ''));
        continue;
      }
      
      // Extract other subtractions
      const otherSubMatch = rowText.match(/(other\s+subtractions|other\s+withdrawals)(?:[\s\n\r]*[:=]?[\s\n\r]*|[^a-zA-Z0-9]*|[\s\n\r]*-[\s\n\r]*)[\$]?([\d,]+\.\d{2})/i);
      if (otherSubMatch) {
        otherSubtractions = parseFloat(otherSubMatch[2].replace(/,/g, ''));
        continue;
      }
      
      // Legacy pattern matching if key-value fails
      if (beginningBalance === null && rowText.includes('beginning balance')) {
        beginningBalance = this.extractAmount(rowText);
      }
      
      if (endingBalance === null && rowText.includes('ending balance')) {
        endingBalance = this.extractAmount(rowText);
      }
    }
    
    // Store all values in account metadata
    account.metadata = account.metadata || {};
    
    // Store balances
    if (beginningBalance !== null) account.metadata.beginningBalance = beginningBalance;
    if (endingBalance !== null) account.metadata.endingBalance = endingBalance;
    
    // Store additional financial summary data
    if (depositsTotal !== null) account.metadata.depositsTotal = depositsTotal;
    if (atmDebitTotal !== null) account.metadata.atmDebitTotal = atmDebitTotal; 
    if (checksTotal !== null) account.metadata.checksTotal = checksTotal;
    if (serviceFees !== null) account.metadata.serviceFees = serviceFees;
    if (otherSubtractions !== null) account.metadata.otherSubtractions = otherSubtractions;
    
    // Log only missing values
    const missingValues = [];
    if (beginningBalance === null) missingValues.push('Beginning Balance');
    if (endingBalance === null) missingValues.push('Ending Balance');
    if (depositsTotal === null) missingValues.push('Deposits Total');
    if (atmDebitTotal === null) missingValues.push('ATM & Debit Total');
    if (checksTotal === null) missingValues.push('Checks Total');
    if (serviceFees === null) missingValues.push('Service Fees');
    if (otherSubtractions === null) missingValues.push('Other Subtractions');
    
    if (missingValues.length > 0) {
      console.log(`Account Summary (Table Method) - Missing values for account ${account.accountNumberLast4}: ${missingValues.join(', ')}`);
    } else {
      console.log(`Account Summary (Table Method) - All values found for account ${account.accountNumberLast4}`);
    }
  }
  
  /**
   * Process transaction tables (deposits and withdrawals) across multiple pages
   */
  private async processTransactionTables(
    startPage: number,
    endPage: number,
    account: Account
  ): Promise<void> {
    // Use an object to map transaction categories
    const allTransactions: {
      deposits: Array<BofATransaction & { type: 'DEPOSIT' }>;
      withdrawals: Array<BofATransaction & { type: 'WITHDRAWAL' }>;
      atmDebit: Array<BofATransaction & { type: 'ATM_DEBIT' }>;
      [key: string]: Array<BofATransaction>;
    } = {
      deposits: [],
      withdrawals: [],
      atmDebit: []
    };
    
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      const page = await this.documentProcessor?.processPage(pageNum);
      if (!page) continue;
      
      // Process deposits table
      const deposits = await this.processDepositsTable(page, account);
      if (deposits && deposits.length > 0) {
        // Add category to each transaction
        const categorizedDeposits = deposits.map(t => ({
          ...t, 
          category: 'deposits'
        }));
        allTransactions.deposits.push(...categorizedDeposits);
      }

      // Process ATM and Debit Card Transactions table
      const atmDebit = await this.processAtmDebitTable(page, account);
      if (atmDebit && atmDebit.length > 0) {
        // Add category to each transaction
        const categorizedAtmDebit = atmDebit.map(t => ({
          ...t, 
          category: 'atmDebit'
        }));

        allTransactions.atmDebit.push(...categorizedAtmDebit);
      }
      
      // Process withdrawals table
      const withdrawals = await this.processWithdrawalsTable(page, account);
      if (withdrawals && withdrawals.length > 0) {
        // Add category to each transaction
        const categorizedWithdrawals = withdrawals.map(t => ({
          ...t, 
          category: 'withdrawals'
        }));
        allTransactions.withdrawals.push(...categorizedWithdrawals);
      }
      
      // Check if we've reached the end of this account's section
      const isEndOfAccountSection = this.isEndOfAccountSection(page, account);
      if (isEndOfAccountSection && pageNum > startPage) {
        console.log(`Reached end of account ${account.accountNumberLast4} section on page ${pageNum}`);
        break;
      }
    }
    
    // Initialize transaction categories in account if not already present
    if (!account.allTransactions) {
      account.allTransactions = {
        deposits: [],
        atmDebit: [],
        withdrawals: [],
        checks: [],
        fees: [],
        other: []
      };
    }
    
    // Add atmDebit array if it doesn't exist
    if (!account.allTransactions.atmDebit) {
      account.allTransactions.atmDebit = [];
    }
    
    // Assign all transactions to the account object
    Object.entries(allTransactions).forEach(([category, transactions]) => {
      if (account.allTransactions && account.allTransactions[category]) {
        // Type assertion to satisfy TypeScript
        const standardTransactions = transactions.map(t => {
          return {
            date: t.date,
            description: t.description,
            amount: t.amount,
            type: t.type,
            rawRowText: t.rawRowText
          } as Transaction;
        });
        account.allTransactions[category].push(...standardTransactions);
      }
    });
    
    // Log transaction counts
    const totalTransactions = Object.values(allTransactions).reduce(
      (total, categoryTransactions) => total + categoryTransactions.length, 
      0
    );
    
    console.log(`Added ${totalTransactions} total transactions to account ${account.accountNumberLast4}`);
  }
  
  /**
   * Process the Deposits table on a page
   */
  private async processDepositsTable(
    page: ProcessedPage,
    account: Account
  ): Promise<Array<BofATransaction & { type: 'DEPOSIT' }>> {
    console.log(`------------ LOOKING FOR DEPOSITS TABLE ON PAGE ${page.pageNumber}`)
    
    // Define anchors for the Deposits table
    const depositsBounds = {
      topAnchor: this.findClosestTextInPage(page, [
        "Deposits and other additions",
        "Deposits and other additions - continued"
      ]),
      bottomAnchor: this.findClosestTextInPage(page, [
        "Total deposits and other additions", 
        "continued on the next page"
      ]),
      
    };
    
    // Try to find deposits tables using Document AI's table detection
    const depositTables = page.tables.filter(table => {
      const headerText = table.headerCells.join(' ').toLowerCase();
      return headerText.includes('date') && 
             headerText.includes('description') && 
             headerText.includes('amount');
    });
    
    const transactions: Array<BofATransaction & { type: 'DEPOSIT' }> = [];
    
    if (depositTables.length > 0 && depositsBounds.topAnchor) {
      console.log(`Found ${depositTables.length} potential Deposits tables`);
      
      // Find the table that's closest to the "Deposits and other additions" heading
      const depositsTable = this.findTableNearAnchor(page, depositTables, depositsBounds.topAnchor);
      
      if (depositsTable) {
        // Extract the full table data - use exclusive bottom boundary to avoid including the total row
        const fullTableData = await this.extractFullTableDataForTransactions(
          page.pageNumber, 
          depositsTable, 
          depositsBounds,
          {
            topBoundaryMode: 'exclusive', // Don't include the header
            bottomBoundaryMode: 'exclusive', // Don't include the footer
            includeAnchors: false // Don't include anchor blocks
          }
        );
        
        if (fullTableData && fullTableData.rows) {
          // Process each row as a deposit transaction
          for (const row of fullTableData.rows) {
            
            // Skip rows that are too short
            if (row.length < 2) continue;
            
            // Check if this is a header or transaction
            const rowCheck = this.isHeaderRow(row);
            
            // Skip header rows
            if (rowCheck.isHeader && !rowCheck.isTransaction) {
              console.log("Skipping header row");
              continue;
            }

            if (rowCheck.isTransaction) {
               const transactionData = row.filter(cell => {
                  const cellText = cell.toLowerCase();
                  if (cellText.includes("date") || cellText.includes("description") || cellText.includes("amount")) {
                    return false;
                  }
                  return true;
               })

               // Process as transaction with correct typing
               const transaction = this.extractTransactionFromRow(transactionData, 'DEPOSIT') as BofATransaction & { type: 'DEPOSIT' };
               if (transaction.amount) {
                  transactions.push(transaction);
               }   
            }
          }
          
          console.log(`Extracted ${transactions.length} deposits from table`);
        }
      }
    } else {
      console.error("No deposits table found");
    }
    
    return transactions;
  }
  
  /**
   * Process the Withdrawals table on a page
   */
  private async processWithdrawalsTable(
    page: ProcessedPage,
    account: Account
  ): Promise<Array<BofATransaction & { type: 'WITHDRAWAL' }>> {
    console.log(`------------ LOOKING FOR WITHDRAWALS TABLE ON PAGE ${page.pageNumber}`)
    
    // Define anchors for the Withdrawals table
    const withdrawalsBounds = {
      topAnchor: this.findClosestTextInPage(page, [
        "Other subtractions",
        "Service fees",
        "Withdrawals and other subtractions",
        "Withdrawals and other subtractions - continued"
      ]),
      bottomAnchor: this.findClosestTextInPage(page, [
        "continued on the next page",
        "Total other subtractions",
        "Total service fees",
        "Total withdrawals and other subtractions"
      ])
    };

    // console.log("withdrawalsBounds", withdrawalsBounds)
    
    // Try to find withdrawals tables using Document AI's table detection
    const withdrawalTables = page.tables.filter(table => {
      const headerText = table.headerCells.join(' ').toLowerCase();
      return headerText.includes('date') && 
             headerText.includes('description') && 
             headerText.includes('amount');
    });
    
    const transactions: Array<BofATransaction & { type: 'WITHDRAWAL' }> = [];
    
    if (withdrawalTables.length > 0 && withdrawalsBounds.topAnchor) {
      console.log(`Found ${withdrawalTables.length} potential Withdrawals tables`);
      
      // Find the table that's closest to the "Withdrawals and other subtractions" heading
      const withdrawalsTable = this.findTableNearAnchor(page, withdrawalTables, withdrawalsBounds.topAnchor);
      // console.log("withdrawalsTable", withdrawalsTable)
      
      if (withdrawalsTable) {
        // Extract the full table data - use exclusive boundaries to avoid header/footer
        const fullTableData = await this.extractFullTableDataForTransactions(
          page.pageNumber, 
          withdrawalsTable, 
          withdrawalsBounds,
          {
            topBoundaryMode: 'exclusive', // Don't include the header
            bottomBoundaryMode: 'exclusive', // Don't include the footer
            includeAnchors: false // Don't include anchor blocks
          }
        );
        
        if (fullTableData && fullTableData.rows) {
          // Process each row as a withdrawal transaction
          for (const row of fullTableData.rows) {
            // Skip rows that are too short
            if (row.length < 2) continue;
            
            // Check if this is a header or transaction
            const rowCheck = this.isHeaderRow(row);
            
            // Skip header rows
            if (rowCheck.isHeader && !rowCheck.isTransaction) {
              console.log("Skipping header row");
              continue;
            }
            
            // Process as transaction with correct typing
            const transaction = this.extractTransactionFromRow(row, 'WITHDRAWAL') as BofATransaction & { type: 'WITHDRAWAL' };
            
            // Add to results if we have an amount
            if (transaction.amount) {
              transactions.push(transaction);
            }
          }

          console.log(`Extracted ${transactions.length} withdrawals from table`);
        }
      }
    } else {
      console.error("No withdrawals table found");
    }
    
    return transactions;
  }

  /**
   * Process the ATM and Debit Card Transactions table on a page
   */
  private async processAtmDebitTable(
    page: ProcessedPage,
    account: Account
  ): Promise<Array<BofATransaction & { type: 'ATM_DEBIT' }>> {
    console.log(`------------ LOOKING FOR ATM AND DEBIT CARD TABLE ON PAGE ${page.pageNumber}`)
    
    // Define anchors for the ATM and Debit Card table
    const atmDebitBounds = {
      topAnchor: this.findClosestTextInPage(page, [
        "ATM and debit card subtractions",
        "ATM and debit card subtractions - continued"
      ]),
      bottomAnchor: this.findClosestTextInPage(page, [
        "Total ATM and debit card subtractions",
        "continued on the next page"
      ])
    };
    
    // Try to find ATM and debit tables using Document AI's table detection
    const atmDebitTables = page.tables.filter(table => {
      const headerText = table.headerCells.join(' ').toLowerCase();
      return headerText.includes('date') && 
             headerText.includes('description') && 
             headerText.includes('amount');
    });
    
    const transactions: Array<BofATransaction & { type: 'ATM_DEBIT' }> = [];
    
    if (atmDebitTables.length > 0 && atmDebitBounds.topAnchor) {
      console.log(`Found ${atmDebitTables.length} potential ATM and Debit Card tables`);
      
      // Find the table that's closest to the "ATM and debit card subtractions" heading
      const atmDebitTable = this.findTableNearAnchor(page, atmDebitTables, atmDebitBounds.topAnchor);
      
      if (atmDebitTable) {
        // Extract the full table data - use exclusive boundaries to avoid header/footer
        const fullTableData = await this.extractFullTableDataForTransactions(
          page.pageNumber, 
          atmDebitTable, 
          atmDebitBounds,
          {
            topBoundaryMode: 'exclusive', // Don't include the header
            bottomBoundaryMode: 'exclusive', // Don't include the footer
            includeAnchors: false // Don't include anchor blocks
          }
        );
        
        if (fullTableData && fullTableData.rows) {
          // Process each row as an ATM/debit transaction
          for (const row of fullTableData.rows) {
            // Skip rows that are too short
            if (row.length < 2) continue;
            
            // Check if this is a header or transaction
            const rowCheck = this.isHeaderRow(row);
            
            // Skip header rows
            if (rowCheck.isHeader && !rowCheck.isTransaction) {
              console.log("Skipping header row");
              continue;
            }
            
            // Process as transaction with explicit ATM_DEBIT type
            const baseTransaction = this.extractTransactionFromRow(row, 'ATM_DEBIT');
            // Create properly typed transaction
            const transaction = {
              ...baseTransaction,
              type: 'ATM_DEBIT' as const
            };
            
            // Add to results if we have an amount
            if (transaction.amount) {
              transactions.push(transaction);
            }
          }

          console.log(`Extracted ${transactions.length} ATM and debit card transactions from table`);
        }
      }
    } else {
      console.error("No ATM and debit card table found");
    }
    
    return transactions;
  }
  
  /**
   * Extract transaction information from a table row
   */
  private extractTransactionFromRow(
    row: string[],
    type: 'DEPOSIT' | 'WITHDRAWAL' | 'ATM_DEBIT'
  ): BofATransaction {
    // Join all cells in the row as a backup
    const rowText = row.join(' ');
    
    // Try to identify date, description, and amount columns
    let dateVal: string | null = null;
    let descVal: string | null = null;
    let amountVal: number | null = null;
    
    // Look for date in first column (common pattern)
    if (row.length > 0) {
      const dateMatch = row[0].match(/(\d{2})\/(\d{2})\/(\d{2}|\d{4})/);
      if (dateMatch) {
        dateVal = dateMatch[0];
      }
    }
    
    // Look for amount in last column (common pattern)
    if (row.length > 1) {
      const amountText = row[row.length - 1];
      amountVal = this.extractAmount(amountText);
      
      // If no amount in last column, try other columns
      if (amountVal === null) {
        for (const cell of row) {
          const cellAmount = this.extractAmount(cell);
          if (cellAmount !== null) {
            amountVal = cellAmount;
            break;
          }
        }
      }
    }
    
    // Middle columns (or all non-date, non-amount columns) are description
    if (row.length > 2) {
      const startIdx = dateVal ? 1 : 0;
      const endIdx = row.length - (amountVal !== null ? 1 : 0);
      descVal = row.slice(startIdx, endIdx).join(' ').trim();
    } else if (row.length === 2) {
      // For 2-column tables, assume date and amount if both present, otherwise
      // one is description and the other is either date or amount
      if (dateVal !== null && amountVal !== null) {
        descVal = ''; // No description column
      } else if (dateVal !== null) {
        descVal = row[1];
      } else if (amountVal !== null) {
        descVal = row[0];
      } else {
        // If no clear date or amount, use both columns as description
        descVal = rowText;
      }
    }
    
    // Apply sign adjustment for withdrawals
    if ((type === 'WITHDRAWAL' || type === 'ATM_DEBIT') && amountVal !== null) {
      amountVal = -Math.abs(amountVal);
    }
    
    return {
      date: dateVal,
      description: descVal,
      amount: amountVal,
      type,
      rawRowText: rowText
    };
  }
  
  /**
   * Extract dollar amount from text
   */
  private extractAmount(text: string): number | null {
    // Match format $1,234.56 or 1,234.56 or -$1,234.56 or -1,234.56
    const amountMatch = text.match(/\$?([\d,]+\.\d{2})/);
    if (amountMatch) {
      // Convert to number, removing commas
      let amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      
      // Check if amount is negative (indicated by minus sign or parentheses)
      if (text.includes('-') || /\(\$?[\d,]+\.\d{2}\)/.test(text)) {
        amount = -amount;
      }
      
      return amount;
    }
    return null;
  }
  
  /**
   * Check if text is likely a header row or a transaction row
   * Returns an object with both determinations
   */
  private isHeaderRow(row: string[]): { isHeader: boolean, isTransaction: boolean } {
    const headerTerms = ['date', 'description', 'amount', 'balance', 'Transaction description'];
    const rowText = row.join(' ').toLowerCase();
    
    // First check if the row has transaction data (date and amount)
    const hasDate = row.some(cell => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cell.trim()));
    const hasAmount = row.some(cell => {
      const trimmed = cell.trim();
      // Check for simple numbers with decimal points or standard currency formats
      return /^\d+\.\d{2}$/.test(trimmed) || /\$?[\d,]+\.\d{2}/.test(trimmed);
    });
    
    // If the row has both date and amount, it's very likely a transaction row
    const isTransaction = hasDate && hasAmount;
    
    // Check for header terms
    let headerCount = 0;
    for (const term of headerTerms) {
      if (rowText.includes(term)) {
        headerCount++;
      }
    }
    
    // Consider it a header if it has multiple header terms
    const isHeader = headerCount >= 2;
    
    // If it's clearly a transaction, it's not a header regardless of terms
    if (isTransaction) {
      return { isHeader: false, isTransaction: true };
    }
    
    return { isHeader, isTransaction };
  }
  
  /**
   * Find the closest text match in a page from a list of options
   */
  private findClosestTextInPage(page: ProcessedPage, options: string[]): string | undefined {
    for (const option of options) {
      for (const block of page.textBlocks) {
        if (block.text.toLowerCase().includes(option.toLowerCase())) {
          return option;
        }
      }
    }
    return undefined;
  }
  
  /**
   * Find the table closest to a specific anchor text
   */
  private findTableNearAnchor(page: ProcessedPage, tables: ProcessedTable[], anchorText: string): ProcessedTable | null {
    // Find the anchor block
    const anchorBlock = page.textBlocks.find(block => 
      block.text.toLowerCase().includes(anchorText.toLowerCase())
    );
    
    if (!anchorBlock) return tables[0]; // If no anchor found, return first table
    
    // Find the table with the closest centerY to the anchor
    const anchorCenterY = (anchorBlock.boundingBox.y1 + anchorBlock.boundingBox.y2) / 2;
    
    let closestTable = tables[0];
    let closestDistance = Number.MAX_SAFE_INTEGER;
    
    for (const table of tables) {
      // Estimate table position from header cells
      const tableCenterY = this.estimateTablePosition(page, table);
      
      const distance = Math.abs(tableCenterY - anchorCenterY);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestTable = table;
      }
    }
    
    return closestTable;
  }
  
  /**
   * Estimate table position based on associated text blocks
   */
  private estimateTablePosition(page: ProcessedPage, table: ProcessedTable): number {
    // Look for header cells in the text blocks to approximate table position
    const headerTexts = table.headerCells.map(h => h.toLowerCase());
    
    let totalY = 0;
    let count = 0;
    
    for (const block of page.textBlocks) {
      const blockText = block.text.toLowerCase();
      for (const header of headerTexts) {
        if (blockText.includes(header)) {
          totalY += (block.boundingBox.y1 + block.boundingBox.y2) / 2;
          count++;
          break;
        }
      }
    }
    
    return count > 0 ? totalY / count : 0.5; // Default to middle of page if not found
  }
  
  /**
   * Check if a page represents the end of an account's section
   */
  private isEndOfAccountSection(page: ProcessedPage, account: Account): boolean {
    // Check if another account number appears on this page, different from the current one
    const accountPattern = new RegExp(`account\\s+(?:number|#)?\\s*[:.]?\\s*[x\\*]*\\d{4}`, 'i');
    
    for (const block of page.textBlocks) {
      if (accountPattern.test(block.text)) {
        // Check if this is a different account than the current one
        if (!block.text.includes(account.accountNumberLast4)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Extract statement period from extracted date data
   */
  private extractStatementPeriod(dateData: any, data: ProcessedStatementData): void {
    if (dateData['statement-period'] && dateData['statement-period'].length > 0) {
      const periodText = dateData['statement-period'][0].text;
      const match = periodText.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,|)?\s+(\d{4})\s+(?:to|through|-)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,|)?\s+(\d{4})/i);
      
      if (match) {
        // Correctly format dates using all captured groups
        data.statementPeriodStartDate = `${match[1]} ${match[2]}, ${match[3]}`;
        data.statementPeriodEndDate = `${match[4]} ${match[5]}, ${match[6]}`;
        console.log(`Found statement period: ${data.statementPeriodStartDate} to ${data.statementPeriodEndDate}`);
      }
    } else if (dateData['date-mm-dd-yyyy'] && dateData['date-mm-dd-yyyy'].length >= 2) {
      // Use the first two dates as fallback
      data.statementPeriodStartDate = dateData['date-mm-dd-yyyy'][0].value;
      data.statementPeriodEndDate = dateData['date-mm-dd-yyyy'][1].value;
      console.log(`Using dates as statement period: ${data.statementPeriodStartDate} to ${data.statementPeriodEndDate}`);
    }
  }
} 