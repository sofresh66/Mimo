/**
 * Valide un paramètre de redirection `next` : uniquement un chemin interne simple
 * (pas d'URL absolue, pas de « // », pas de caractères exotiques) pour éviter
 * les redirections ouvertes.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !/^\/[A-Za-z0-9/_-]*$/.test(value) || value.startsWith('//')) return null;
  return value;
}

/** Ajoute `?next=` à une URL si le chemin est sûr. */
export function withNext(href: string, next: string | null): string {
  const safe = safeNextPath(next);
  return safe ? `${href}?next=${encodeURIComponent(safe)}` : href;
}
