"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUpload } from "./file-upload";
import { api } from "@/trpc/client";
import { toast } from "sonner";
import { FileCheck, Upload, Loader2, AlertCircle, Info, Calendar, Badge, CreditCard } from "lucide-react";
import { format } from "date-fns";

// Format date helper
function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "Unknown";
  try {
    return format(new Date(dateStr), 'MMM d, yyyy');
  } catch (e) {
    return String(dateStr);
  }
}

export function UploadForm() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<any>(null);

  // Handle error type in onError properly
  const uploadMutation = api.statement.upload.useMutation({
    onSuccess: () => {
      toast.success("Statement uploaded successfully", {
        description: "Your statement is now processing. You can view its status on the dashboard.",
        duration: 5000,
      });
    },
    onError: (error: any) => {
      toast.error("Failed to upload statement", {
        description: error.message || "Something went wrong. Please try again.",
        duration: 5000,
      });
      router.push("/dashboard");
    },
  });

  // Create mutation for checking duplicates
  const checkDuplicateMutation = api.statement.checkDuplicate.useMutation({
    onSuccess: (data) => {
      if (data.error) {
        toast.error("Error checking for duplicates", {
          description: data.error,
        });
        return;
      }

      if (data.isDuplicate || data.warning || (data.accounts && data.accounts.length > 0)) {
        // We found a potential duplicate or matching accounts, show dialog
        setDuplicateInfo(data);
        setShowDuplicateDialog(true);
      } else {
        // No duplicates, proceed with upload
        proceedWithUpload();
      }
    },
    onError: (error: any) => {
      toast.error("Error checking for duplicates", {
        description: error.message || "Something went wrong. Please try again.",
      });
      // Still proceed with upload as a fallback
      proceedWithUpload();
    }
  });

  const handleFileSelected = (file: File, fileData: Blob) => {
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("No file selected", {
        description: "Please select a file to upload.",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Use FormData approach for file upload
      const formData = new FormData();
      formData.append("file", selectedFile);

      // Upload file to temporary storage first
      const response = await fetch("/api/upload-temp", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload file");
      }

      const { fileUrl } = await response.json();
      setFileUrl(fileUrl);

      // Check for duplicates before processing
      checkDuplicateMutation.mutate({
        filename: selectedFile.name,
        fileType: selectedFile.type,
        fileUrl: fileUrl,
      });
    } catch (error) {
      setIsUploading(false);
      toast.error(
        error instanceof Error ? error.message : "Failed to upload file"
      );
    }
  };

  const proceedWithUpload = () => {
    if (!selectedFile || !fileUrl) {
      setIsUploading(false);
      return;
    }

    // Toast notification before redirecting
    toast.info("Uploading statement...", {
      description: "You'll be redirected to the dashboard",
      duration: 3000,
    });

    // Create the statement record in the background
    uploadMutation.mutate({
      filename: selectedFile.name,
      fileType: selectedFile.type,
      fileUrl: fileUrl,
    });

    // Immediately redirect to dashboard
    router.push("/dashboard");
  };

  const handleConfirmUpload = () => {
    setShowDuplicateDialog(false);
    proceedWithUpload();
  };

  const handleCancelUpload = () => {
    setShowDuplicateDialog(false);
    setIsUploading(false);
  };

  return (
    <>
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Upload Financial Statement</CardTitle>
          <CardDescription>
            Upload your bank or credit card statement to track your expenses
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FileUpload onFileSelected={handleFileSelected} />

          <div className="mt-6 space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-1">
              <FileCheck className="h-4 w-4" />
              Tips for best results
            </h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
              <li>Use PDF statements directly from your bank</li>
              <li>Ensure the PDF is not password protected</li>
              <li>Statements should include account details and transaction history</li>
            </ul>
          </div>
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard")}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleUpload} 
            disabled={!selectedFile || isUploading}
            className="gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {fileUrl ? "Checking for duplicates..." : "Uploading..."}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload Statement
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Duplicate Statement Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              {duplicateInfo?.isDuplicate 
                ? "Duplicate Statement Detected" 
                : "Statement Information"}
            </DialogTitle>
            <DialogDescription>
              {duplicateInfo?.isDuplicate 
                ? "This statement appears to be a duplicate of one you've already uploaded."
                : "We found the following information in your statement."}
            </DialogDescription>
          </DialogHeader>

          {duplicateInfo && (
            <div className="space-y-4">
              {/* Filename Duplicate Warning */}
              {duplicateInfo.duplicateType === 'filename' && (
                <div className="bg-amber-50 border border-amber-100 rounded-md p-3 text-sm">
                  <p className="font-medium text-amber-900 flex items-center gap-1.5">
                    <Info className="h-4 w-4" />
                    A statement with the same filename has already been uploaded
                  </p>
                </div>
              )}

              {/* Period & Account Match */}
              {duplicateInfo.duplicateType === 'periodAndAccount' && duplicateInfo.statement && (
                <div className="bg-amber-50 border border-amber-100 rounded-md p-3 text-sm">
                  <p className="font-medium text-amber-900 flex items-center gap-1.5">
                    <Info className="h-4 w-4" />
                    This statement appears to be for the same period and account as one you've already uploaded
                  </p>
                  <p className="text-amber-800 mt-1 pl-5">
                    Existing statement: {duplicateInfo.statement.filename}
                  </p>
                </div>
              )}

              {/* Statement Period */}
              {duplicateInfo.statementPeriod && (
                <div className="border rounded-md p-3">
                  <h3 className="font-medium flex items-center gap-1.5 mb-2">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    Statement Period
                  </h3>
                  <p className="text-sm pl-5">
                    {formatDate(duplicateInfo.statementPeriod.start)} - {formatDate(duplicateInfo.statementPeriod.end)}
                  </p>
                </div>
              )}

              {/* Accounts Found */}
              {duplicateInfo.potentialAccounts && duplicateInfo.potentialAccounts.length > 0 && (
                <div className="border rounded-md p-3">
                  <h3 className="font-medium flex items-center gap-1.5 mb-2">
                    <CreditCard className="h-4 w-4 text-blue-500" />
                    Accounts Found in Statement
                  </h3>
                  <div className="space-y-2 pl-5">
                    {duplicateInfo.potentialAccounts.map((account: any, index: number) => {
                      // Check if this account has a match in existing accounts
                      const matchingAccount = duplicateInfo.accounts?.find((a: any) => 
                        a.lastFourDigits === account.accountNumberLast4
                      );
                      
                      return (
                        <div key={index} className="text-sm flex items-center justify-between">
                          <div>
                            <span className="font-medium">{account.accountType || "Account"}</span>
                            <span className="text-muted-foreground ml-2">•••• {account.accountNumberLast4}</span>
                          </div>
                          
                          {matchingAccount && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                              Matches existing account
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Warning about similar statements */}
              {duplicateInfo.statementsInPeriod && duplicateInfo.statementsInPeriod.length > 0 && (
                <div className="bg-gray-50 border rounded-md p-3 text-sm">
                  <p className="font-medium mb-1 flex items-center gap-1.5">
                    <Info className="h-4 w-4" />
                    Similar statement periods found:
                  </p>
                  <ul className="pl-5 space-y-1">
                    {duplicateInfo.statementsInPeriod.slice(0, 3).map((stmt: any) => (
                      <li key={stmt.id} className="text-muted-foreground">
                        {stmt.filename} ({formatDate(stmt.periodStart)} - {formatDate(stmt.periodEnd)})
                      </li>
                    ))}
                    {duplicateInfo.statementsInPeriod.length > 3 && (
                      <li className="text-muted-foreground">
                        ... and {duplicateInfo.statementsInPeriod.length - 3} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancelUpload}>
              Cancel Upload
            </Button>
            <Button onClick={handleConfirmUpload}>
              Proceed with Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
