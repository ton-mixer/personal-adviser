import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// This function can be marked `async` if using `await` inside
export default withAuth(
  // Augment the request
  function middleware(_req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/",
    },
  },
);

// Specify the paths that should be protected by this middleware
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/upload/:path*",
    "/review/:path*",
  ],
};
