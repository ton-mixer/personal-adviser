"use client";

import { api } from "@/trpc/client";

export function TrpcTest() {
  const { data: sessionData, isLoading } = api.user.getSession.useQuery();

  return (
    <div className="p-4 bg-gray-100 rounded-md mb-4">
      <h2 className="text-lg font-semibold mb-2">tRPC Test Component</h2>
      {isLoading ? (
        <p>Loading session data...</p>
      ) : (
        <div>
          <p>
            Session Status:{" "}
            {sessionData ? "Authenticated" : "Not authenticated"}
          </p>
          <pre className="mt-2 p-2 bg-gray-200 rounded text-xs overflow-auto">
            {JSON.stringify(sessionData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
