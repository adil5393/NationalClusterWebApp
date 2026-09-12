import { createContext, useContext } from "react";

export type PermissionLevel = "view" | "edit";

export interface Me {
  authenticated: boolean;
  id?: number;
  username?: string;
  full_name?: string | null;
  is_admin?: boolean;
  permissions?: Record<string, PermissionLevel>;
  staff_member?: { id: number; full_name: string; category?: string | null } | null;
  // Matches this account can fully control (except delete/reset) independent of
  // the "matches" module permission — see backend security.require_match_access.
  assigned_match_ids?: number[];
}

export const PermissionsContext = createContext<Me | null>(null);

export function useMe(): Me | null {
  return useContext(PermissionsContext);
}

/** Whether the current user can view / edit a given gated module (see backend
 * schemas.ORGANIZER_MODULES). Admins always get both; a missing module key
 * means no access at all — EXCEPT for "matches", where being assigned to at
 * least one match also grants canView (mirrors security.require_match_access's
 * independent access path), even with zero "matches" permission. Editing a
 * specific assigned match is still gated per-match by the caller (see
 * Matches.tsx's canControlMatch), not by this hook. */
export function useModuleAccess(moduleKey: string): { canView: boolean; canEdit: boolean } {
  const me = useMe();
  if (!me) return { canView: false, canEdit: false };
  if (me.is_admin) return { canView: true, canEdit: true };
  const level = me.permissions?.[moduleKey];
  const canEdit = level === "edit";
  let canView = level === "view" || canEdit;
  if (moduleKey === "matches" && (me.assigned_match_ids?.length ?? 0) > 0) canView = true;
  return { canView, canEdit };
}

/** Per-match control check for the Matches & Fixtures page: full "matches"
 * edit access controls everything; otherwise only matches this account is
 * assigned to, and only for the plain lifecycle actions (start/score/pause/
 * resume/complete/cancel/forfeit/postpone) — never delete/reset/general edit/
 * mat assignment, which the backend (security.require_match_access) always
 * requires real module edit access for regardless of assignment. */
export function useMatchControl(matchId: number): boolean {
  const { canEdit } = useModuleAccess("matches");
  const me = useMe();
  if (canEdit) return true;
  return !!me?.assigned_match_ids?.includes(matchId);
}
