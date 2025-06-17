import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { mkdir } from "fs/promises";

// Define allowed file types
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"];

// Max file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Upload directory
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function POST(request: NextRequest) {
  try {
    // Check auth with proper auth options
    const session = await getServerSession(authOptions);

    // Debug session information
    console.log("Session in upload API:", !!session, session?.user?.id);

    // If there's no session or user, return 401
    if (!session || !session.user || !session.user.id) {
      console.log("Unauthorized: No valid session or user ID");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create uploads directory if it doesn't exist
    try {
      await mkdir(UPLOAD_DIR, { recursive: true });
    } catch (error) {
      console.error("Error creating upload directory:", error);
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload JPEG, PNG, or PDF files." },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 },
      );
    }

    // Generate unique filename
    const fileExtension =
      path.extname(file.name) ||
      (file.type === "application/pdf"
        ? ".pdf"
        : file.type === "image/jpeg"
          ? ".jpg"
          : ".png");

    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(UPLOAD_DIR, fileName);

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save the file
    await fs.writeFile(filePath, buffer);

    console.log(`File saved to ${filePath}`);

    return NextResponse.json({
      success: true,
      fileName: fileName,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      path: filePath,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
