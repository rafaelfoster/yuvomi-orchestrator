/**
 * Derives ROOT_DOMAIN from the admin console's own hostname (served at
 * <ADMIN_SUBDOMAIN>.<ROOT_DOMAIN>) rather than needing a separate build-time
 * config value — works regardless of what ADMIN_SUBDOMAIN is actually set
 * to. Returns null in local dev (bare "localhost", no subdomain structure)
 * where there's no real root domain to derive.
 */
export function rootDomain(): string | null {
  const host = window.location.hostname;
  const parts = host.split(".");
  if (parts.length < 3) return null; // e.g. "localhost" or a bare domain
  return parts.slice(1).join(".");
}

export function tenantUrl(subdomain: string): string | null {
  const domain = rootDomain();
  return domain ? `https://${subdomain}.${domain}` : null;
}
