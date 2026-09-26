// Staff permission flags, layered on top of the isAdmin (super-admin) flag —
// isAdmin passes every check. Flags live directly on the user record.

export const PERMISSIONS = [{ key: "canAccessSupport", label: "Moderation — review reports, remove listings, suspend users" }];

export function hasPermission(user, key) {
  if (!user) return false;
  return Boolean(user.isAdmin || user[key]);
}

export function hasAnyPermission(user) {
  if (!user) return false;
  return Boolean(user.isAdmin || PERMISSIONS.some((p) => user[p.key]));
}
