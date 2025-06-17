"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, X, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Define accepted file types
const ACCEPTED_FILE_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/pdf": [".pdf"],
};

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

type FileUploadStatus = "idle" | "uploading" | "success" | "error";

type FileWithPreview = File & {
  preview?: string;
};

interface FileUploadProps {
  onFileSelected: (file: File, fileData: Blob) => void;
}

export function FileUpload({ onFileSelected }: FileUploadProps) {
  const [file, setFile] = useState<FileWithPreview | null>(null);
  const [status, setStatus] = useState<FileUploadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      // Reset errors
      setErrorMessage("");

      if (acceptedFiles.length === 0) {
        return;
      }

      const selectedFile = acceptedFiles[0];

      // Validate file size
      if (selectedFile.size > MAX_FILE_SIZE) {
        setErrorMessage("File is too large. Maximum size is 10MB.");
        return;
      }

      // Create preview for image files
      if (selectedFile.type.startsWith("image/")) {
        const fileWithPreview = Object.assign(selectedFile, {
          preview: URL.createObjectURL(selectedFile),
        });
        setFile(fileWithPreview);
      } else {
        setFile(selectedFile);
      }

      // Pass file and file data to parent component
      onFileSelected(selectedFile, selectedFile);
      toast.success(`File "${selectedFile.name}" selected successfully.`);
    },
    [onFileSelected],
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      accept: ACCEPTED_FILE_TYPES,
      maxSize: MAX_FILE_SIZE,
      maxFiles: 1,
    });

  // Handle rejected files
  if (fileRejections.length > 0) {
    const rejection = fileRejections[0];
    if (rejection.errors[0].code === "file-too-large") {
      setErrorMessage("File is too large. Maximum size is 10MB.");
    } else if (rejection.errors[0].code === "file-invalid-type") {
      setErrorMessage(
        "Invalid file type. Please upload a JPEG, PNG, or PDF file.",
      );
    }
  }

  // Clear file selection
  const removeFile = () => {
    if (file?.preview) {
      URL.revokeObjectURL(file.preview);
    }
    setFile(null);
    setStatus("idle");
    setErrorMessage("");
  };

  return (
    <div className="w-full">
      {!file ? (
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50"}
            ${errorMessage ? "border-destructive/50 bg-destructive/5" : ""}
          `}
        >
          <input {...getInputProps()} data-testid="file-input" />
          <div className="flex flex-col items-center justify-center gap-3">
            <Upload
              size={36}
              className={`${isDragActive ? "text-primary" : "text-muted-foreground"}`}
            />
            {isDragActive ? (
              <p className="text-lg font-medium">
                Drop your statement file here
              </p>
            ) : (
              <>
                <p className="text-lg font-medium">
                  Drag & drop your statement file here
                </p>
                <p className="text-sm text-muted-foreground">
                  or click to browse (JPEG, PNG, or PDF)
                </p>
                <p className="text-xs text-muted-foreground">
                  Max file size: 10MB
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-muted h-12 w-12 rounded-md flex items-center justify-center">
                  <File size={24} className="text-primary" />
                </div>
                <div>
                  <p className="font-medium line-clamp-1">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={removeFile}>
                <X size={18} />
                <span className="sr-only">Remove file</span>
              </Button>
            </div>

            {file.preview && (
              <div className="mt-2 relative aspect-[16/9] w-full overflow-hidden rounded-md">
                <img
                  src={file.preview}
                  alt="Preview"
                  className="object-contain w-full h-full"
                  onLoad={() => {
                    URL.revokeObjectURL(file.preview!);
                  }}
                />
              </div>
            )}

            {status === "success" && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle size={16} />
                <span className="text-sm">File uploaded successfully</span>
              </div>
            )}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mt-2 flex items-center gap-2 text-destructive">
          <AlertCircle size={16} />
          <span className="text-sm">{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
