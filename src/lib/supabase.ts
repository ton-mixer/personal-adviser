import { createClient } from '@supabase/supabase-js';

// Get Supabase URL and anon key from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Check if Supabase credentials are available
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials. Please check your environment variables.');
}

// Create Supabase client
export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);

// Helper function to get storage URL for a file
export function getStorageUrl(bucket: string, path: string): string {
  if (!supabaseUrl) {
    console.error('Missing Supabase URL in environment variables');
    return '';
  }
  
  // Clean the URL to avoid double slashes
  let baseUrl = supabaseUrl;
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  
  // Ensure the path doesn't start with a slash
  let cleanPath = path;
  if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.slice(1);
  }
  
  // Format: https://<project-ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
  return `${baseUrl}/storage/v1/object/public/${bucket}/${cleanPath}`;
}

// Helper function to upload a file to Supabase Storage
export async function uploadToStorage(
  bucket: string, 
  path: string, 
  file: File | Blob,
  fileType?: string
): Promise<{ error: Error | null; url: string | null }> {
  try {
    // Log the upload attempt
    console.log(`Uploading to Supabase Storage: bucket=${bucket}, path=${path}, type=${fileType || file.type}`);
    
    // Clean the path to avoid issues
    let uploadPath = path;
    if (uploadPath.startsWith('/')) {
      uploadPath = uploadPath.slice(1);
    }
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(uploadPath, file, {
        contentType: fileType || file.type,
        upsert: true,
      });

    if (error) {
      console.error('Error uploading to Supabase Storage:', error);
      return { error: error as Error, url: null };
    }

    // Generate the public URL for the uploaded file
    const url = getStorageUrl(bucket, uploadPath);
    console.log(`File uploaded successfully. URL: ${url}`);
    return { error: null, url };
  } catch (error) {
    console.error('Error uploading to Supabase Storage:', error);
    return { error: error as Error, url: null };
  }
} 