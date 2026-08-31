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
}

export const PermissionsContext = createContext<Me | null>(null);

export function useMe(): Me | null {
  return useContext(PermissionsContext);
}

/** Whether the current user can view / edit a given gated module (see backend
 * schemas.ORGANIZER_MODULES). Admins always get both; a missing module key
 * means no access at all. */
export function useModuleAccess(moduleKey: string): { canView: boolean; canEdit: boolean } {
  const me = useMe();
  if (!me) return { canView: false, canEdit: false };
  if (me.is_admin) return { canView: true, canEdit: true };
  const level = me.permissions?.[moduleKey];
  return { canView: level === "view" || level === "edit", canEdit: level === "edit" };
}
