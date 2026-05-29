import { NextRequest, NextResponse } from "next/server";
import {
  getAuthCredentials,
  getAuthDisplayInitials,
  isRequestAuthenticated,
} from "@/lib/authSession";

export async function GET(req: NextRequest) {
  const { user } = getAuthCredentials();
  const authenticated = await isRequestAuthenticated(req);

  return NextResponse.json({
    authenticated,
    username: authenticated ? user : undefined,
    userPlaceholder: user,
    userInitials: getAuthDisplayInitials(user),
  });
}
