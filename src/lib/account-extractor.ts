/**
 * Account information extractor
 * 
 * This module extracts account information from bank statements
 */

interface ExtractedAccountInfo {
  accountName?: string;
  financialInstitution?: string; 
  lastFourDigits?: string;
  accountType?: 'CHECKING' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT' | 'OTHER';
  balance?: number;
}

/**
 * Extract account information from statement text
 */
export function extractAccountInfo(text: string): ExtractedAccountInfo {
  // Initialize empty result
  const result: ExtractedAccountInfo = {};
  
  // Normalize text: convert to lowercase, remove extra whitespace
  const normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
  
  // Extract financial institution
  result.financialInstitution = extractFinancialInstitution(text);
  
  // Extract account type
  result.accountType = extractAccountType(text);
  
  // Extract account name
  result.accountName = extractAccountName(text, result.financialInstitution);
  
  // Extract last 4 digits of account number
  result.lastFourDigits = extractLastFourDigits(text);
  
  // Extract account balance
  result.balance = extractBalance(text);
  
  return result;
}

/**
 * Extract financial institution name from text
 */
function extractFinancialInstitution(text: string): string | undefined {
  // List of common bank names to look for
  const commonBanks = [
    'chase', 'bank of america', 'wells fargo', 'citibank', 'capital one',
    'us bank', 'pnc bank', 'td bank', 'truist', 'hsbc', 'ally', 'discover',
    'american express', 'amex', 'goldman sachs', 'barclays', 'bmo harris',
    'citizens bank', 'fifth third bank', 'regions bank', 'santander', 'usaa',
    'navy federal', 'fidelity', 'vanguard', 'charles schwab', 'robinhood'
  ];
  
  // Check for bank names in text
  const lowerText = text.toLowerCase();
  for (const bank of commonBanks) {
    if (lowerText.includes(bank)) {
      // For multi-word banks, capitalize each word properly
      return bank.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  }
  
  // Try more complex regex patterns if simple name matching fails
  const bankPatterns = [
    /(?:welcome to|statement from|issued by)\s+([A-Z][A-Za-z\s]{2,30}(?:Bank|Financial|Credit Union|Card))/,
    /([A-Z][A-Za-z\s]{2,30}(?:Bank|Financial|Credit Union|Card))\s+(?:statement|account)/i,
  ];
  
  for (const pattern of bankPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

/**
 * Extract account type from text
 */
function extractAccountType(text: string): 'CHECKING' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT' | 'OTHER' | undefined {
  const lowerText = text.toLowerCase();
  
  // Check for account type keywords
  if (lowerText.includes('checking') || lowerText.includes('current account')) {
    return 'CHECKING';
  }
  
  if (lowerText.includes('savings') || lowerText.includes('save account')) {
    return 'SAVINGS';
  }
  
  if (lowerText.includes('credit card') || 
      lowerText.includes('visa') || 
      lowerText.includes('mastercard') || 
      lowerText.includes('amex') || 
      lowerText.includes('american express')) {
    return 'CREDIT';
  }
  
  if (lowerText.includes('investment') || 
      lowerText.includes('brokerage') || 
      lowerText.includes('trading') || 
      lowerText.includes('securities') ||
      lowerText.includes('portfolio')) {
    return 'INVESTMENT';
  }
  
  // More specific account type regex patterns
  const accountTypePatterns = [
    { type: 'CHECKING', pattern: /(?:primary|premier|advantage|basic|standard|regular)\s+checking/i },
    { type: 'SAVINGS', pattern: /(?:high\s+yield|premier|advantage)\s+savings/i },
    { type: 'CREDIT', pattern: /(?:platinum|gold|rewards|cash\s+back|travel)\s+card/i },
    { type: 'INVESTMENT', pattern: /(?:retirement|ira|401k|roth|individual|joint)\s+(?:account|portfolio)/i }
  ];
  
  for (const { type, pattern } of accountTypePatterns) {
    if (pattern.test(text)) {
      return type as 'CHECKING' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT';
    }
  }
  
  return 'OTHER';
}

/**
 * Extract account name from text
 */
function extractAccountName(text: string, bank?: string): string | undefined {
  // Try to find account name patterns
  const accountNamePatterns = [
    /(?:account name|account title)\s*[:;-]?\s*([A-Za-z\s]{3,30}?)(?:\r|\n|,|\s{2,}|$)/i,
    /(?:account|card) holder\s*[:;-]?\s*([A-Za-z\s]{3,30}?)(?:\r|\n|,|\s{2,}|$)/i,
    // Credit card account name patterns
    /([A-Za-z\s]{2,}?)\s+(?:Platinum|Gold|Rewards|Signature|Premier|Cash)\s+(?:Card|Credit Card|Visa|MasterCard)/i,
  ];
  
  for (const pattern of accountNamePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // If no specific account name found, create one from what we know
  if (bank) {
    const accountType = extractAccountType(text);
    if (accountType) {
      // Create a generic account name
      return `${bank} ${accountType.charAt(0)}${accountType.slice(1).toLowerCase()}`;
    }
    return `${bank} Account`;
  }
  
  return undefined;
}

/**
 * Extract last 4 digits of account number
 */
function extractLastFourDigits(text: string): string | undefined {
  // Common patterns for account number display
  const patterns = [
    /account\s+(?:number|#|no)?\s*[:\*\-]+\s*(?:x{1,10}|\.{1,10}|\*{1,10}|•{1,10}|\s+)(\d{4})(?:\s|$|\.|\,)/i,
    /account\s+(?:number|ending in|ending with)(?:\s|\:)+(\d{4})(?:\s|$|\.|\,)/i,
    /(?:card|account)(?:\s|\:)+(?:x{1,10}|\.{1,10}|\*{1,10}|•{1,10}|\s+)(\d{4})(?:\s|$|\.|\,)/i,
    /(?:x{4}|\.{4}|\*{4}|•{4})-(?:x{4}|\.{4}|\*{4}|•{4})-(?:x{4}|\.{4}|\*{4}|•{4})-(\d{4})/i,
    /ending in\s+(\d{4})(?:\s|$|\.|\,)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // Fallback pattern: look for 4 digits that appear to be part of an account number
  const fallbackMatch = text.match(/(?:x{1,10}|\.{1,10}|\*{1,10}|•{1,10})(\d{4})(?:\s|$|\.|\,)/i);
  if (fallbackMatch && fallbackMatch[1]) {
    return fallbackMatch[1];
  }
  
  return undefined;
}

/**
 * Extract account balance from text
 */
function extractBalance(text: string): number | undefined {
  // Patterns for finding account balance
  const balancePatterns = [
    /(?:current balance|ending balance|new balance|balance|total due)(?:\s|\:)+[\$\£\€]?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)(?:\s|$|\.|\,)/i,
    /(?:balance(?:\s|\:)+(?:as of|on)(?:\s|\:)+\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s|\:)+)?[\$\£\€]?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)(?:\s|$|\.|\,)/i,
    /[\$\£\€](\d{1,3}(?:,\d{3})*(?:\.\d{2})?)(?:\s+(?:cr|dr))?(?:\s|$|\.|\,)/i
  ];
  
  for (const pattern of balancePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Remove commas and convert to number
      return parseFloat(match[1].replace(/,/g, ''));
    }
  }
  
  return undefined;
}

/**
 * Generate a period string for a statement (month/year)
 */
export function extractStatementPeriod(text: string): { start?: Date, end?: Date } {
  const result: { start?: Date, end?: Date } = {};
  
  // Look for statement period
  const periodPatterns = [
    /statement period:?\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(?:to|-|through)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(?:billing|statement) cycle:?\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(?:to|-|through)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /from\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(?:to|-|through)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i
  ];
  
  for (const pattern of periodPatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[2]) {
      try {
        result.start = new Date(match[1]);
        result.end = new Date(match[2]);
        if (!isNaN(result.start.getTime()) && !isNaN(result.end.getTime())) {
          return result;
        }
      } catch (e) {
        // If date parsing fails, continue to next pattern
        console.warn('Failed to parse dates:', match[1], match[2]);
      }
    }
  }
  
  // Look for statement date (single date, usually the end of the period)
  const datePatterns = [
    /statement date:?\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /as of:?\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /closing date:?\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      try {
        const date = new Date(match[1]);
        if (!isNaN(date.getTime())) {
          result.end = date;
          // Estimate start date (30 days before for credit cards, end of previous month for checking)
          const estimatedStart = new Date(date);
          estimatedStart.setDate(1); // First day of the month
          result.start = estimatedStart;
          return result;
        }
      } catch (e) {
        console.warn('Failed to parse date:', match[1]);
      }
    }
  }
  
  return result;
} 