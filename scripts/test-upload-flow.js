/**
 * Test script for the complete statement upload flow
 *
 * This script tests:
 * 1. File upload to the API endpoint
 * 2. Vision AI processing
 * 3. Statement record creation in the database
 *
 * Usage: node scripts/test-upload-flow.js <path-to-test-file>
 */

require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const FormData = require("form-data");
const { PrismaClient } = require("@prisma/client");

// Initialize Prisma client
const prisma = new PrismaClient();

// Create a mock session for testing
const TEST_USER_EMAIL = "test@example.com";

async function ensureTestUser() {
  // Check if test user exists
  let user = await prisma.user.findUnique({
    where: { email: TEST_USER_EMAIL },
  });

  // Create test user if it doesn't exist
  if (!user) {
    console.log(`Creating test user with email: ${TEST_USER_EMAIL}`);
    user = await prisma.user.create({
      data: {
        email: TEST_USER_EMAIL,
        name: "Test User",
      },
    });
  }

  return user;
}

async function testUploadFlow() {
  try {
    console.log("🧪 Starting upload flow test");

    // Dynamically import node-fetch
    const { default: fetch } = await import("node-fetch");

    // Check command line arguments
    const testFilePath = process.argv[2];
    if (!testFilePath) {
      console.error("❌ Error: No file provided");
      console.error("Usage: node scripts/test-upload-flow.js <path-to-file>");
      process.exit(1);
    }

    // Verify the file exists
    try {
      await fs.access(testFilePath);
      console.log(`✅ Test file exists: ${testFilePath}`);
    } catch (error) {
      console.error(`❌ Test file not found: ${testFilePath}`);
      process.exit(1);
    }

    // Get file details
    const fileStats = await fs.stat(testFilePath);
    const fileName = path.basename(testFilePath);
    const fileType = fileName.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : fileName.toLowerCase().endsWith(".jpg") ||
          fileName.toLowerCase().endsWith(".jpeg")
        ? "image/jpeg"
        : "image/png";

    console.log(
      `📄 File: ${fileName} (${fileType}, ${(fileStats.size / 1024).toFixed(2)} KB)`,
    );

    // Ensure test user exists
    const user = await ensureTestUser();
    console.log(`👤 Test user: ${user.name} (${user.id})`);

    // Step 1: Test file upload to API
    console.log("\n🔄 Step 1: Testing file upload to API");

    const fileBuffer = await fs.readFile(testFilePath);
    const formData = new FormData();
    formData.append("file", fileBuffer, {
      filename: fileName,
      contentType: fileType,
    });

    // Add the user ID to cookies to simulate an authenticated session
    const cookies = `next-auth.session-token={"user":{"id":"${user.id}","name":"${user.name}","email":"${user.email}"}}`;

    try {
      console.log(`📤 Uploading ${fileName} to API...`);

      // Upload the file to the API
      const uploadResponse = await fetch("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
        headers: {
          Cookie: cookies,
        },
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.text();
        throw new Error(
          `API responded with status ${uploadResponse.status}: ${errorData}`,
        );
      }

      const uploadResult = await uploadResponse.json();
      console.log("✅ File uploaded successfully to API");
      console.log(`📝 Server filename: ${uploadResult.fileName}`);
      console.log(`📂 Server path: ${uploadResult.path}`);

      // Step 2: Create statement record in DB
      console.log("\n🔄 Step 2: Creating statement record in DB");

      const beforeCount = await prisma.statement.count({
        where: { userId: user.id },
      });

      // Create a statement record directly
      const statement = await prisma.statement.create({
        data: {
          userId: user.id,
          filename: fileName,
          status: "UPLOADED",
        },
      });

      console.log(`✅ Statement record created with ID: ${statement.id}`);

      // Step 3: Test Vision AI processing
      console.log("\n🔄 Step 3: Testing Vision AI processing");
      console.log(`🔍 Processing file: ${uploadResult.path}`);

      // Update status to processing
      await prisma.statement.update({
        where: { id: statement.id },
        data: { status: "PROCESSING" },
      });

      // Import Vision AI module dynamically
      const { processStatement } = require("../src/lib/vision-ai");

      try {
        console.log("📄 Calling Vision AI text extraction...");
        const extractedText = await processStatement(
          uploadResult.path,
          fileType,
        );

        if (!extractedText) {
          throw new Error("No text extracted from file");
        }

        // Update the statement record with extracted text
        await prisma.statement.update({
          where: { id: statement.id },
          data: {
            status: "REVIEW_NEEDED",
            processedTimestamp: new Date(),
            rawText: extractedText,
          },
        });

        console.log(`✅ Vision AI processing successful`);
        console.log(`📝 Extracted ${extractedText.length} characters of text`);
        console.log(`📋 Text preview: "${extractedText.substring(0, 100)}..."`);
      } catch (error) {
        console.error(`❌ Vision AI processing failed: ${error.message}`);

        // Update the statement with error
        await prisma.statement.update({
          where: { id: statement.id },
          data: {
            status: "FAILED",
            errorMessage: error.message,
          },
        });

        throw error;
      }

      // Step 4: Verify database records
      console.log("\n🔄 Step 4: Verifying database records");

      const afterCount = await prisma.statement.count({
        where: { userId: user.id },
      });

      console.log(
        `📊 Statement count before: ${beforeCount}, after: ${afterCount}`,
      );

      if (afterCount !== beforeCount + 1) {
        throw new Error(
          "Statement count mismatch. Record may not have been created properly.",
        );
      }

      // Get the final statement record
      const finalStatement = await prisma.statement.findUnique({
        where: { id: statement.id },
      });

      console.log(`📝 Final statement status: ${finalStatement.status}`);
      console.log(`📅 Upload timestamp: ${finalStatement.uploadTimestamp}`);
      console.log(
        `📅 Processed timestamp: ${finalStatement.processedTimestamp}`,
      );
      console.log(
        `📊 Raw text length: ${finalStatement.rawText ? finalStatement.rawText.length : 0} characters`,
      );

      console.log("\n✅ Upload flow test completed successfully!");
    } catch (error) {
      console.error(`\n❌ Error testing upload flow: ${error.message}`);
      console.error(error);
      process.exit(1);
    } finally {
      // Clean up by disconnecting from Prisma
      await prisma.$disconnect();
    }
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

testUploadFlow();
