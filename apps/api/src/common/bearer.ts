/**
 * Bearer-token parsing for the embed transport.
 *
 * The embedded widget cannot rely on the `HttpOnly` session cookie (a third-party
 * cookie inside somebody else's iframe), so it presents the same opaque token in the
 * `Authorization` header instead. Both the HTTP guard and the embed controller need
 * to read it, and they must agree on the format — hence one function.
 */
export function parseBearerToken(header: string | undefined | null): string | null {
  if (!header) return null;

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
