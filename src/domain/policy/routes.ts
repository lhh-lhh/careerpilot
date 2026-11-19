import type { Actor, Role } from "../../types/identity";
import { roleHome } from "../../types/identity";
/** A return URL is navigation, never a grant to another role's workspace. */
export function loginDestination(role: Role, redirect: unknown): string {
  const fallback = roleHome[role];
  if (
    typeof redirect !== "string" ||
    !redirect.startsWith("/") ||
    redirect.startsWith("//") ||
    /[\\\s]/.test(redirect)
  )
    return fallback;
  try {
    const url = new URL(redirect, "https://careerpilot.invalid");
    if (url.origin !== "https://careerpilot.invalid") return fallback;
    const path = decodeURIComponent(url.pathname);
    if (
      path === fallback ||
      path.startsWith(`${fallback}/`) ||
      path === "/opportunities" ||
      path.startsWith("/opportunities/")
    )
      return redirect;
  } catch {
    /* Reject malformed and external targets. */
  }
  return fallback;
}
export function canAccessRole(
  actor: Actor | null,
  allowedRoles: readonly Role[],
): boolean {
  return actor !== null && allowedRoles.includes(actor.role);
}
