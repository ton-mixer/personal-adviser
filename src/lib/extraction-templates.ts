import { ExtractionTemplate } from './document-processor';

/**
 * Common extraction templates for financial documents
 */

// for March 12, 2024 to April 10, 2024 is the format for statement period

// Template for dates in various formats
export const dateExtractionTemplate: ExtractionTemplate = {
  id: 'common-dates',
  patterns: [
    {
      regex: /(\d{1,2}\/\d{1,2}\/\d{2,4})/g,
      type: 'date-mm-dd-yyyy',
    },
    {
      regex: /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
      type: 'date-month-name',
    },
    {
      regex: /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\s*(?:to|-|through)\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i,
      type: 'statement-period',
    }
  ]
};

// Template for account information
export const accountExtractionTemplate: ExtractionTemplate = {
  id: 'account-info',
  patterns: [
    {
      regex: /(?:^|\s)(\d{4})(?:\s*$)/i,
      type: 'account-last4',
      groupIndex: 1
    },
    {
      regex: /(?:checking|savings|credit card|deposit)\s+account/i,
      type: 'account-type',
    },
    {
      regex: /(?:beginning|opening)\s+balance:?\s*\$?([\d,.]+)/i,
      type: 'beginning-balance',
      groupIndex: 1
    },
    {
      regex: /(?:ending|closing)\s+balance:?\s*\$?([\d,.]+)/i,
      type: 'ending-balance',
      groupIndex: 1
    }
  ]
};

// Template for transactions
export const transactionExtractionTemplate: ExtractionTemplate = {
  id: 'transaction-markers',
  patterns: [
    {
      regex: /transactions|account\s+activity|deposits|withdrawals/i,
      type: 'transaction-section',
    },
    {
      regex: /payment|deposit|withdrawal|transfer|check|debit|credit/i,
      type: 'transaction-type',
    },
    {
      regex: /\$\s*([\d,.]+)/,
      type: 'dollar-amount',
      groupIndex: 1
    }
  ]
};

// Bank of America specific template
export const bankOfAmericaTemplate: ExtractionTemplate = {
  id: 'bank-of-america',
  patterns: [
    {
      regex: /bank\s+of\s+america|bankofamerica|bofa/i,
      type: 'bank-name',
    },
    {
      regex: /your\s+account\s+at\s+a\s+glance/i,
      type: 'account-summary-section',
    },
    {
      regex: /deposits\s+and\s+other\s+additions/i,
      type: 'deposits-section',
    },
    {
      regex: /withdrawals\s+and\s+other\s+subtractions/i,
      type: 'withdrawals-section',
    }
  ]
};

// Chase specific template
export const chaseTemplate: ExtractionTemplate = {
  id: 'chase',
  patterns: [
    {
      regex: /chase|jpmorgan\s+chase/i,
      type: 'bank-name',
    },
    {
      regex: /account\s+summary/i,
      type: 'account-summary-section',
    },
    {
      regex: /electronic\s+withdrawals/i,
      type: 'electronic-withdrawals-section',
    },
    {
      regex: /atm\s+&\s+debit\s+card\s+transactions/i,
      type: 'debit-card-section',
    }
  ]
}; 