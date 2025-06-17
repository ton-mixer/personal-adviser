import { processStatement } from "./document-ai";
import { ProcessedStatementData } from "./parsers";
import { promises as fs } from "fs";
import fetch from "node-fetch";

interface ProcessUploadResult {
  success: boolean;
  data?: ProcessedStatementData | null;
  error?: string;
}

/**
 * Process an uploaded file using Document AI
 * @param filePathOrUrl Path or URL to the uploaded file
 * @param fileType MIME type of the file
 * @returns ProcessUploadResult containing structured data or an error
 */
export async function processUploadedFile(
  filePathOrUrl: string,
  fileType: string,
): Promise<ProcessUploadResult> {
  console.log('\n--------------- BEGIN FILE PROCESSING USING DOCUMENT AI FORM PARSER ----------------');
  console.log(`Processing uploaded file: ${filePathOrUrl} (${fileType})`);

  let fileContent: Buffer;
  let isUrl = false;

  // Determine if it's a URL and fetch content
  if (filePathOrUrl.startsWith('http')) {
    isUrl = true;
    try {
      console.log('Processing file from URL');
      const headers: Record<string, string> = {};
      if (
        filePathOrUrl.includes('supabase') && 
        !filePathOrUrl.includes('/public/') &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
      ) {
        headers['Authorization'] = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
      }
      const cleanUrl = filePathOrUrl.replace(/([^:]\/)\/\/+/g, "$1");
      console.log(`Fetching URL: ${cleanUrl}`);
      const response = await fetch(cleanUrl, { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText} (${response.status})`);
      }
      const arrayBuffer = await response.arrayBuffer();
      fileContent = Buffer.from(arrayBuffer);
      console.log(`Successfully downloaded file: ${fileContent.length} bytes`);
    } catch (fetchError) {
      console.error('Error fetching file from URL:', fetchError);
      return {
        success: false,
        error: `Failed to fetch file from URL: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
      };
    }
  } else {
    // It's a local file path
    try {
      await fs.access(filePathOrUrl);
      const stats = await fs.stat(filePathOrUrl);
      console.log(`File exists and is accessible. Size: ${stats.size} bytes`);
      fileContent = await fs.readFile(filePathOrUrl);
    } catch (error) {
      console.error(`File access error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: `File not found or not accessible: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // --- Document AI Processing --- 
  console.log("Calling Document AI processing...");

  let tempFilePath = filePathOrUrl;
  let needsCleanup = false;

  try {
    // Create a temporary local file ONLY if the input was a URL
    if (isUrl) {
      try {
        await fs.mkdir('/tmp', { recursive: true });
      } catch (err) {
        // Ignore if dir exists
      }
      // Generate a temporary file path
      const extension = fileType.split('/')[1] || 'file';
      tempFilePath = `/tmp/temp-statement-${Date.now()}.${extension}`;
      await fs.writeFile(tempFilePath, fileContent);
      needsCleanup = true;
      console.log(`Created temporary file for processing: ${tempFilePath}`);
    }

    // Call the Document AI processing function with the (potentially temporary) local path
    const processingResult = await processStatement(tempFilePath, fileType);

    if (processingResult === null) {
       console.warn("Document AI processing returned null. Check document-ai.ts logs for errors.");
       return {
         success: false,
         error: "Document AI processing failed or returned no data. Check server logs.",
       };
    }

    // Check if structured data has meaningful content beyond raw text/entities
    // Explicitly check properties we expect to be parsed
    const hasMeaningfulData = 
        processingResult.bankName ||
        (processingResult.accounts && processingResult.accounts.length > 0) ||
        processingResult.statementPeriodStartDate ||
        processingResult.statementPeriodEndDate;
        // Add other potential fields here if needed
        
    if (!hasMeaningfulData) {
        console.warn("Document AI processing succeeded, but no specific entities (bank name, dates, etc.) were extracted based on current parsing rules in document-ai.ts.");
        // Decide if this is an error or just partial success - treating as success for now.
    }

    console.log(
      `Successfully processed document. Raw text length: ${processingResult.rawText.length}`,
    );
    return {
      success: true,
      data: processingResult, // Return the full structured data object
    };

  } catch (docAiError) {
    // Catch any errors that might occur during the processStatement call itself (though it should return null)
    console.error("Error during Document AI processing step:", docAiError);
    return {
      success: false,
      error: `Error during Document AI processing: ${docAiError instanceof Error ? docAiError.message : String(docAiError)}`,
    };
  } finally {
    // Clean up temporary file if created
    if (needsCleanup) {
      try {
        await fs.unlink(tempFilePath);
        console.log(`Deleted temporary file: ${tempFilePath}`);
      } catch (cleanupError) {
        console.warn('Failed to delete temporary file:', cleanupError);
      }
    }
  }
}
