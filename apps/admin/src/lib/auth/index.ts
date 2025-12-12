// Re-export types (safe for both client and server)

// Re-export client utilities (safe for client components)
export { AuthProvider, useAuth, useSignOut, useUser } from "./client";
export type { AuthState, User } from "./types";

// NOTE: Server utilities must be imported directly:
// import { currentUser } from "@/lib/auth/server";
