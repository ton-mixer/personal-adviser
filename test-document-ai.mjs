import { processUploadedFile } from './src/lib/file-processing.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Configure dotenv to load environment variables from .env
dotenv.config();

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
  // Get statement file path from command line arguments
  const args = process.argv.slice(2);
  let testFilePath;
  let testFileType = 'application/pdf'; // Default file type
  let testFileSource;

  if (args.length > 0) {
    // Use the provided file path from command line
    testFilePath = args[0];
    
    // Check if the file exists
    if (!fs.existsSync(testFilePath)) {
      console.error(`Error: File not found at path: ${testFilePath}`);
      return;
    }
    
    // Detect file type based on extension if not provided as second argument
    if (args.length > 1) {
      testFileType = args[1];
    } else {
      const ext = path.extname(testFilePath).toLowerCase();
      if (ext === '.pdf') {
        testFileType = 'application/pdf';
      } else if (ext === '.png') {
        testFileType = 'image/png';
      } else if (ext === '.jpg' || ext === '.jpeg') {
        testFileType = 'image/jpeg';
      }
    }
    
    testFileSource = testFilePath;
  } else {
    // Fallback to default file if no argument provided
    testFilePath = path.join(__dirname, 'uploads/BOA_1729_April11-May11_Stmt.pdf');
    testFileType = 'application/pdf';
    testFileSource = testFilePath;
    
    console.log('No file path provided as argument. Using default file:');
    console.log(`Default file: ${testFilePath}`);
    console.log('To specify a file, run: node test-document-ai.mjs /path/to/your/file.pdf');
    
    // Check if default file exists
    if (!fs.existsSync(testFilePath)) {
      console.error(`Error: Default file not found at path: ${testFilePath}`);
      console.error('Please provide a valid file path as an argument:');
      console.error('node test-document-ai.mjs /path/to/your/file.pdf');
      return;
    }
  }

  console.log(`Using Document AI Form Parser to scan first page of: ${testFileSource}`);
  console.log(`File type: ${testFileType}`);

  try {
    const result = await processUploadedFile(testFileSource, testFileType);

    console.log('---------------------- TEST RESULT ----------------------');
    if (result.success) {
      console.log('✅ OCR Scan Succeeded!');
      
      console.log('\n📄 Document Overview:');
      console.log(`Found ${result.textBlockCount || 'undefined'} text blocks`);
      console.log(`Found ${result.tableCount || 'undefined'} tables detected by Document AI`);
      
      // Display some basic information from the scan
      console.log('\n📋 Basic Information:');
      
      // Check if basicInfo exists
      if (result.basicInfo) {
        if (result.basicInfo.pageNumbers && result.basicInfo.pageNumbers.length > 0) {
          console.log('\n  Page Numbers:');
          result.basicInfo.pageNumbers.forEach(text => console.log(`   - ${text}`));
        }
        
        if (result.basicInfo.dates && result.basicInfo.dates.length > 0) {
          console.log('\n  Dates:');
          result.basicInfo.dates.forEach(text => console.log(`   - ${text}`));
        }
        
        if (result.basicInfo.dollarAmounts && result.basicInfo.dollarAmounts.length > 0) {
          console.log('\n  Dollar Amounts:');
          result.basicInfo.dollarAmounts.slice(0, 5).forEach(text => console.log(`   - ${text}`));
          if (result.basicInfo.dollarAmounts.length > 5) {
            console.log(`   - ... and ${result.basicInfo.dollarAmounts.length - 5} more`);
          }
        }
        
        if (result.basicInfo.accountInfo && result.basicInfo.accountInfo.length > 0) {
          console.log('\n  Account Information:');
          result.basicInfo.accountInfo.slice(0, 5).forEach(text => console.log(`   - ${text}`));
          if (result.basicInfo.accountInfo.length > 5) {
            console.log(`   - ... and ${result.basicInfo.accountInfo.length - 5} more`);
          }
        }
      } else {
        console.log('  No basic information extracted. Form Parser focuses on structured data.');
      }
      
      // Table information
      if (result.tableInfo && result.tableInfo.length > 0) {
        console.log('\n📊 Tables Detected:');
        result.tableInfo.forEach((table, i) => {
          console.log(`  Table ${i+1}: ${table.rowCount || 'unknown'} rows`);
          if (table.headerCells && table.headerCells.length > 0) {
            console.log(`   Headers: ${table.headerCells.join(' | ')}`);
          }
        });
      } else {
        console.log('\n📊 No tables were detected on the first page');
      }
      
      console.log('\n📁 OCR Results saved to:');
      console.log(`   ocr-blocks-${path.basename(testFileSource)}.json`);
      console.log('\n💡 Tip: You can use the OCR results to build a custom parser for your specific bank statements');
    } else {
      console.error('❌ OCR Scan Failed!');
      console.error('Error:', result.error);
    }
    console.log('--------------------------------------------------------');
  } catch (error) {
    console.error('---------------------- SCRIPT ERROR ----------------------');
    console.error('An unexpected error occurred in the test script:', error);
    console.error('----------------------------------------------------------');
  }
}

runTest();