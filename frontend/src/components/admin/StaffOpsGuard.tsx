import { Navigate } from "react-router-dom";
import { useMe } from "@/lib/permissions";

/** Wraps an organizer-only Staff Operations route (Staff Directory, Duties,
 * Tasks board, Accounts, Staff Live Map). Hiding these from the sidebar
 * isn't enough on its own — an account could still type the URL — so this
 * bounces a self-service staff account (see Me.is_self_service_staff) to
 * My Work instead of ever mounting the organizer page. The backend enforces
 * the same boundary independently (security.require_staff_operator,
 * tasks.py), so this is a UX nicety, not the security boundary itself. */
export function StaffOpsGuard({ children }: { children: React.ReactNode }) {
  const me = useMe();
  if (me?.is_self_service_staff) {
    return <Navigate to="/admin/my-work" replace />;
  }
  return <>{children}</>;
}
