/**
 * Test script for Vision AI integration
 *
 * To run this script:
 * 1. Ensure you have a Google Cloud credentials file set up
 * 2. Make sure the GOOGLE_APPLICATION_CREDENTIALS env var is set
 * 3. Run: node scripts/test-vision-ai.js <path-to-file>
 *
 * This script works with both image files (JPG, PNG) and PDF files.
 */

require("dotenv").config();
const path = require("path");
const fs = require("fs").promises;
const { ImageAnnotatorClient } = require("@google-cloud/vision");
const PDFImage = require("pdf-image").PDFImage;
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

// Function to convert a PDF page to an image
async function convertPdfPageToImage(pdfPath, pageNum = 0) {
  console.log(`Converting page ${pageNum} of PDF: ${pdfPath}`);

  try {
    // Create output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), "temp-pdf-images");
    await fs.mkdir(outputDir, { recursive: true }).catch(() => {});

    // Get PDF filename without extension
    const pdfName = path.basename(pdfPath, ".pdf");

    // Generate a unique name for the output file
    const outputBaseName = `${pdfName}-page-${pageNum}-${Date.now()}`;
    const outputPath = path.join(outputDir, outputBaseName);

    // Use pdf-image to convert the page
    const pdfImage = new PDFImage(pdfPath, {
      combinedImage: false,
      convertOptions: {
        "-density": "300",
        "-quality": "100",
      },
    });

    console.log(`Converting PDF page to image...`);
    const imagePath = await pdfImage.convertPage(pageNum);
    console.log(`PDF page converted to: ${imagePath}`);

    return imagePath;
  } catch (error) {
    console.error("Error converting PDF to image:", error);
    throw new Error(
      `Failed to convert PDF to image: ${error.message || String(error)}`,
    );
  }
}

// Function to extract text from a PDF
async function extractTextFromPdf(filePath) {
  console.log(`Processing PDF: ${filePath}`);

  try {
    // Try to determine the number of pages
    let numPages = 1;

    try {
      // Try to get page count using pdftk if available
      const { exec } = require("child_process");
      const util = require("util");
      const execAsync = util.promisify(exec);

      const { stdout } = await execAsync(
        `pdftk "${filePath}" dump_data | grep NumberOfPages | awk '{print $2}'`,
      );
      numPages = parseInt(stdout.trim(), 10);
      console.log(`PDF has ${numPages} pages`);
    } catch (error) {
      console.warn(
        "Could not determine PDF page count. Processing only first page.",
      );
    }

    // Process each page (or just the first if we couldn't determine page count)
    const pagesToProcess = Math.min(numPages, 10); // Limit to 10 pages for performance
    let allText = "";
    const tempFiles = [];

    for (let i = 0; i < pagesToProcess; i++) {
      console.log(`Processing page ${i + 1} of ${pagesToProcess}...`);

      // Convert the PDF page to an image
      const imagePath = await convertPdfPageToImage(filePath, i);
      tempFiles.push(imagePath);

      // Extract text from the image
      const pageText = await extractTextFromImage(imagePath);

      // Append the text with a page marker
      if (pageText) {
        allText += `\n--- Page ${i + 1} ---\n${pageText}\n`;
      }
    }

    // Clean up all temporary images
    for (const file of tempFiles) {
      try {
        await fs.unlink(file);
        console.log(`Cleaned up temporary file: ${file}`);
      } catch (error) {
        console.warn(`Could not delete temporary file: ${file}`, error);
      }
    }

    return allText.trim();
  } catch (error) {
    console.error("Error processing PDF:", error);
    throw error;
  }
}

// Function to extract text directly using Vision API
async function extractTextFromImage(filePath) {
  console.log(`Extracting text from image: ${filePath}`);

  try {
    // Verify file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      throw new Error(`Image file not found at ${filePath}: ${error.message}`);
    }

    // Initialize Vision client
    const client = new ImageAnnotatorClient();

    // Read file content as a Buffer
    const fileContent = await fs.readFile(filePath);
    console.log(`Read ${fileContent.length} bytes from image file`);

    // Perform text detection on the image
    console.log("Calling Vision AI text detection...");
    const [result] = await client.textDetection({
      image: {
        content: fileContent.toString("base64"),
      },
    });
    console.log("Vision AI text detection completed");

    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      console.log("No text detected in the image");
      return "";
    }

    // The first annotation contains the entire extracted text
    const extractedText = detections[0].description || "";
    console.log(`Extracted ${extractedText.length} characters of text`);

    return extractedText;
  } catch (error) {
    console.error("Error extracting text from image:", error);
    throw error;
  }
}

async function testVisionAI() {
  try {
    // Check if credentials are set up
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) {
      console.error(
        "Error: GOOGLE_APPLICATION_CREDENTIALS environment variable not set",
      );
      console.error(
        "Please set it to the path of your Google Cloud credentials JSON file",
      );
      process.exit(1);
    }

    console.log(`Using Google Cloud credentials from: ${credentialsPath}`);

    // Check if credentials file exists
    try {
      const fullPath = path.isAbsolute(credentialsPath)
        ? credentialsPath
        : path.join(process.cwd(), credentialsPath);

      await fs.access(fullPath);
      console.log(`✅ Credentials file exists at: ${fullPath}`);
    } catch (error) {
      console.error(`❌ Credentials file not found: ${error.message}`);
      process.exit(1);
    }

    // Check command line arguments
    const testFilePath = process.argv[2];
    if (!testFilePath) {
      console.error("Error: No file provided");
      console.error("Usage: node scripts/test-vision-ai.js <path-to-file>");
      process.exit(1);
    }

    console.log(`Testing OCR on file: ${testFilePath}`);

    // Extract text based on file type
    let extractedText;
    if (testFilePath.toLowerCase().endsWith(".pdf")) {
      console.log("Detected PDF file, using PDF processing...");
      extractedText = await extractTextFromPdf(testFilePath);
    } else {
      console.log("Detected image file, using direct image processing...");
      extractedText = await extractTextFromImage(testFilePath);
    }

    if (!extractedText) {
      console.error("❌ No text extracted from the file");
      process.exit(1);
    }

    console.log("\n✅ Text extraction successful!");
    console.log(`Extracted ${extractedText.length} characters of text`);
    console.log("\nExtracted text preview (first 500 chars):");
    console.log("-".repeat(50));
    console.log(extractedText.substring(0, 500));
    console.log("-".repeat(50));

    console.log("✅ Test completed successfully");
  } catch (error) {
    console.error("❌ Test failed with error:", error);
    process.exit(1);
  }
}

testVisionAI();
