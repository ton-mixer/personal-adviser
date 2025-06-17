import { requireAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  ChevronRight,
  Building,
  CreditCard,
  PiggyBank,
  Wallet,
  BarChart,
  Clock,
  FileText,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { format, formatDistance } from "date-fns";
import { prisma } from "@/lib/prisma";

// Helper function to get the appropriate icon for account type
function getAccountTypeIcon(type: string) {
  switch (type) {
    case "CHECKING":
      return <Wallet className="h-5 w-5" />;
    case "SAVINGS":
      return <PiggyBank className="h-5 w-5" />;
    case "CREDIT":
      return <CreditCard className="h-5 w-5" />;
    case "INVESTMENT":
      return <BarChart className="h-5 w-5" />;
    default:
      return <CreditCard className="h-5 w-5" />;
  }
}

// Helper function to get status badge for statements
function getStatusBadge(status: string) {
  switch (status) {
    case "UPLOADED":
      return <Badge variant="outline">Uploaded</Badge>;
    case "PROCESSING":
      return <Badge variant="secondary">Processing</Badge>;
    case "REVIEW_NEEDED":
      return <Badge className="bg-yellow-500">Needs Review</Badge>;
    case "COMPLETED":
      return <Badge className="bg-green-500">Completed</Badge>;
    case "FAILED":
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// Format date function that handles nulls
function formatDate(date: Date | null | undefined, formatStr: string = "MMM d, yyyy") {
  if (!date) return "N/A";
  try {
    return format(new Date(date), formatStr);
  } catch (e) {
    return "Invalid date";
  }
}

// Format timeago
function formatTimeAgo(date: Date | null | undefined) {
  if (!date) return "N/A";
  try {
    return formatDistance(new Date(date), new Date(), { addSuffix: true });
  } catch (e) {
    return "Invalid date";
  }
}

// Type definitions for our data
type BankAccount = {
  id: string;
  name: string;
  financialInstitution: string;
  accountType: string;
  lastFourDigits?: string | null;
  balance?: any;
  updatedAt: Date;
  statements: Statement[];
};

type Statement = {
  id: string;
  filename: string;
  status: string;
  uploadTimestamp: Date;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  accounts: BankAccount[];
};

export default async function DashboardPage() {
  const session = await requireAuth();
  
  // Initialize with empty data
  let accounts: BankAccount[] = [];
  let recentStatements: Statement[] = [];
  let hasError = false;
  let errorMessage = "";
  
  try {
    console.log("Fetching bank accounts...");
    
    // Get real data from database
    const accountsData = await prisma.bankAccount.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        statements: {
          orderBy: {
            uploadTimestamp: 'desc',
          },
          take: 2,
        },
      },
    });
    
    console.log(`Found ${accountsData.length} bank accounts`);
    // Use unknown as an intermediate step for type safety
    accounts = accountsData as unknown as BankAccount[];
    
    const statementsData = await prisma.statement.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        uploadTimestamp: 'desc',
      },
      take: 5,
      include: {
        accounts: true,
      },
    });
    
    console.log(`Found ${statementsData.length} statements`);
    // Use unknown as an intermediate step for type safety
    recentStatements = statementsData as unknown as Statement[];
  } catch (error) {
    console.error("Error fetching data from database:", error);
    hasError = true;
    errorMessage = error instanceof Error ? error.message : "Unknown database error";
    
    // Set up fallback data if needed - empty arrays
    accounts = [];
    recentStatements = [];
  }
  
  // Group accounts by financial institution
  const accountsByInstitution = accounts.reduce((acc: Record<string, BankAccount[]>, account) => {
    const institution = account.financialInstitution;
    if (!acc[institution]) {
      acc[institution] = [];
    }
    acc[institution].push(account);
    return acc;
  }, {});

  // Get all unique institutions for tabs
  const institutions = Object.keys(accountsByInstitution);
  
  // Count statements by status
  const statusCounts = {
    processing: recentStatements.filter(s => s.status === "PROCESSING" || s.status === "UPLOADED").length,
    needsReview: recentStatements.filter(s => s.status === "REVIEW_NEEDED").length,
    completed: recentStatements.filter(s => s.status === "COMPLETED").length,
    failed: recentStatements.filter(s => s.status === "FAILED").length,
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {session?.user?.name || "User"}
          </p>
        </div>
        <Link href="/upload">
          <Button size="lg">Upload New Statement</Button>
        </Link>
      </div>

      {hasError && (
        <Card className="mb-6 border-destructive">
        <CardHeader>
            <CardTitle className="text-destructive">Database Error</CardTitle>
          <CardDescription>
              There was a problem fetching your financial data
          </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="p-4 border border-destructive/20 bg-destructive/10 rounded-md">
              <p className="text-destructive mb-1">Error details:</p>
              <pre className="text-sm overflow-auto p-2 bg-background/80 rounded">
                {errorMessage}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Bank Accounts (60% width) */}
        <div className="md:col-span-3">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Your Financial Accounts</CardTitle>
              <CardDescription>
                Overview of your bank accounts and their latest status
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              {accounts.length === 0 ? (
                <div className="text-center py-8">
                  <Building className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="text-lg font-medium">No accounts found</h3>
                  <p className="text-muted-foreground mt-1 mb-4">
                    Upload a statement to automatically create your first account.
                  </p>
                  <Link href="/upload">
                    <Button variant="outline">Upload Statement</Button>
                  </Link>
                </div>
              ) : (
                <Tabs defaultValue={institutions[0] || "all"}>
                  <TabsList className="mb-4">
                    {institutions.map((institution) => (
                      <TabsTrigger key={institution} value={institution}>
                        {institution}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  
                  {institutions.map((institution) => (
                    <TabsContent key={institution} value={institution} className="space-y-4">
                      {accountsByInstitution[institution].map((account) => (
                        <div 
                          key={account.id} 
                          className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              {getAccountTypeIcon(account.accountType)}
                              <div>
                                <h3 className="font-medium">{account.name}</h3>
                                <div className="text-sm text-muted-foreground">
                                  {account.lastFourDigits ? `•••• ${account.lastFourDigits}` : ''}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              {account.balance ? (
                                <div className="font-medium">
                                  ${parseFloat(account.balance.toString()).toFixed(2)}
                                </div>
                              ) : (
                                <div className="text-muted-foreground">Balance unavailable</div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                Last updated: {formatDate(account.updatedAt)}
                              </div>
                            </div>
                          </div>
                          
                          {/* Recent statements for this account */}
                          {account.statements && account.statements.length > 0 ? (
                            <div className="mt-3 pt-3 border-t">
                              <h4 className="text-sm font-medium mb-2">Recent Statements</h4>
                              <div className="space-y-2">
                                {account.statements.map((statement) => (
                                  <div key={statement.id} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-muted-foreground" />
                                      <span>{statement.filename}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {statement.periodStart && statement.periodEnd ? (
                                        <span className="text-xs text-muted-foreground">
                                          {formatDate(statement.periodStart, "MMM d")} - 
                                          {formatDate(statement.periodEnd, "MMM d, yyyy")}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">
                                          {formatTimeAgo(statement.uploadTimestamp)}
                                        </span>
                                      )}
                                      {getStatusBadge(statement.status)}
                                    </div>
                                  </div>
                                ))}
              </div>
            </div>
                          ) : (
                            <div className="mt-3 pt-3 border-t text-sm text-muted-foreground text-center">
                              No statements available for this account
                            </div>
                          )}
                        </div>
                      ))}
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </CardContent>
            
            {accounts.length > 0 && (
              <CardFooter>
                <Link href="/accounts">
                  <Button variant="ghost" size="sm" className="gap-1">
                    Manage all accounts
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardFooter>
            )}
          </Card>
        </div>

        {/* Recent Uploads (40% width) */}
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Statements</CardTitle>
              <CardDescription>
                Your latest statement uploads and their status
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              {recentStatements.length === 0 ? (
                <div className="text-center py-6">
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="text-base font-medium">No statements uploaded yet</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
              Upload your first financial statement to get started.
            </p>
            <Link href="/upload">
                    <Button variant="outline" size="sm">Upload Statement</Button>
            </Link>
          </div>
              ) : (
                <>
                  {/* Status summary */}
                  {statusCounts.processing > 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-md p-3 mb-4 text-sm flex items-start gap-2">
                      <Clock className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-blue-800">
                          {statusCounts.processing === 1 
                            ? "1 statement is being processed" 
                            : `${statusCounts.processing} statements are being processed`}
                        </p>
                        <p className="text-blue-700 text-xs mt-0.5">
                          This may take a few minutes. Results will appear automatically.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {statusCounts.needsReview > 0 && (
                    <div className="bg-yellow-50 border border-yellow-100 rounded-md p-3 mb-4 text-sm flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-yellow-800">
                          {statusCounts.needsReview === 1 
                            ? "1 statement needs review" 
                            : `${statusCounts.needsReview} statements need review`}
                        </p>
                        <p className="text-yellow-700 text-xs mt-0.5">
                          Please review these statements to complete processing.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-4">
                    {recentStatements.map((statement) => (
                      <div 
                        key={statement.id}
                        className="border rounded-lg p-3 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-medium text-sm">{statement.filename}</h3>
                          {getStatusBadge(statement.status)}
                        </div>
                        
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                          <Clock className="h-3 w-3" />
                          <span>Uploaded {formatTimeAgo(statement.uploadTimestamp)}</span>
                        </div>
                        
                        {/* Associated account */}
                        {statement.accounts && statement.accounts.length > 0 && (
                          <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t">
                            <div className="flex items-center gap-1">
                              <Building className="h-3 w-3" />
                              <span>{statement.accounts[0].financialInstitution}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {getAccountTypeIcon(statement.accounts[0].accountType)}
                              <span>{statement.accounts[0].name}</span>
                            </div>
                          </div>
                        )}
                        
                        {/* Statement period */}
                        {statement.periodStart && statement.periodEnd && (
                          <div className="text-xs mt-1 text-muted-foreground">
                            Period: {formatDate(statement.periodStart, "MMM d")} - 
                            {formatDate(statement.periodEnd, "MMM d, yyyy")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
        </CardContent>
            
            {recentStatements.length > 0 && (
              <CardFooter className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  {statusCounts.completed} complete · {statusCounts.processing} processing · {statusCounts.failed} failed
                </p>
                <Link href="/statements">
                  <Button variant="ghost" size="sm" className="gap-1">
                    View all statements
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardFooter>
            )}
      </Card>
        </div>
      </div>
    </div>
  );
}
