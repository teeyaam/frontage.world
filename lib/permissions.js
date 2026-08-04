// Granular staff permission flags, layered on top of the existing isAdmin
// (super-admin) flag rather than replacing it — isAdmin passes every check.
// Still a lightweight stand-in for a real roles system: flags live directly
// on the user record, with no audit trail or scoping beyond on/off.

export const PERMISSIONS = [
  { key: "canApproveContractors", label: "Contractor department — review & approve contractor applications" },
  { key: "canAccessSupport", label: "Customer service — view deals, chat logs, invoices" },
  { key: "canCreateBdrListings", label: "Business development — create pre-built listings for a claim link" },
];

export function hasPermission(user, key) {
  if (!user) return false;
  return Boolean(user.isAdmin || user[key]);
}

export function hasAnyPermission(user) {
  if (!user) return false;
  return Boolean(user.isAdmin || PERMISSIONS.some((p) => user[p.key]));
}
