import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { v4 as uuidv4 } from "uuid";
import { authOptions } from "@/lib/auth";
import { createClient } from '@supabase/supabase-js';

// Create a Supabase client with the service role key (bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in environment variables');
}

const supabaseAdmin = createClient(
  supabaseUrl || '',
  supabaseServiceKey || ''
);

// Create bucket if it doesn't exist
async function ensureBucketExists(bucketName: string, isPublic: boolean = true): Promise<boolean> {
  try {
    // Check if bucket exists
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
    
    if (error) {
      console.error(`Error listing buckets: ${error.message}`);
      return false;
    }
    
    const bucketExists = buckets?.some(b => b.name === bucketName);
    
    if (bucketExists) {
      console.log(`Bucket '${bucketName}' already exists`);
      
      // Make sure it's public if needed
      if (isPublic) {
        const { error: updateError } = await supabaseAdmin.storage.updateBucket(bucketName, {
          public: true,
        });
        
        if (updateError) {
          console.error(`Error updating bucket visibility: ${updateError.message}`);
        } else {
          console.log(`Bucket '${bucketName}' set to public`);
        }
      }
      
      return true;
    }
    
    // Bucket doesn't exist, create it
    console.log(`Creating bucket '${bucketName}'...`);
    const { error: createError } = await supabaseAdmin.storage.createBucket(bucketName, {
      public: isPublic,
    });
    
    if (createError) {
      console.error(`Error creating bucket: ${createError.message}`);
      return false;
    }
    
    console.log(`Bucket '${bucketName}' created successfully, public: ${isPublic}`);
    return true;
  } catch (err) {
    console.error('Unexpected error ensuring bucket exists:', err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication through Next Auth
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only PDF, JPEG and PNG are supported" },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB" },
        { status: 400 }
      );
    }

    // Generate a unique filename to avoid collisions
    const fileExtension = file.name.split(".").pop();
    const uniqueFilename = `${session.user.id}/${uuidv4()}.${fileExtension}`;
    const bucket = "statements";

    // Ensure the statements bucket exists and is public
    const bucketReady = await ensureBucketExists(bucket, true);
    if (!bucketReady) {
      return NextResponse.json(
        { error: "Failed to prepare storage bucket. Please try again." },
        { status: 500 }
      );
    }

    // Convert file to buffer
    const fileBuffer = await file.arrayBuffer();
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: file.type });

    // Upload file to Supabase Storage using the admin client
    console.log(`Uploading file to ${bucket}/${uniqueFilename}`);
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(uniqueFilename, blob, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      console.error('Error uploading to Supabase Storage:', error);
      return NextResponse.json(
        { error: `Upload failed: ${error.message}` },
        { status: 500 }
      );
    }

    // Generate the public URL for the uploaded file
    const fileUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${uniqueFilename}`;
    console.log(`File uploaded successfully. URL: ${fileUrl}`);

    // Return the clean URL
    return NextResponse.json({ fileUrl });
  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload file" },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}; 