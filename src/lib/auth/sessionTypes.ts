/**
 * Normalizes session JSON from Auth.js (`auth(headers)`) into fields we store in JWT/session callbacks.
 * Avoids `any` at call sites.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readAppSessionFields(raw: unknown): {
  userId: string;
  googleId?: string | null;
  email?: string | null;
  name?: string | null;
  image?: string | null;
} | null {
  if (!isRecord(raw)) return null;

  const user = raw.user;
  const userRec = isRecord(user) ? user : null;

  const userId =
    (typeof raw.userId === "string" ? raw.userId : undefined) ??
    (userRec && typeof userRec.userId === "string" ? userRec.userId : undefined);

  if (!userId) return null;

  const googleId =
    (typeof raw.googleId === "string" ? raw.googleId : null) ??
    (userRec && typeof userRec.googleId === "string" ? userRec.googleId : null) ??
    null;

  const email =
    (userRec && typeof userRec.email === "string" ? userRec.email : null) ??
    (typeof raw.email === "string" ? raw.email : null);

  const name =
    (userRec && typeof userRec.name === "string" ? userRec.name : null) ??
    (typeof raw.name === "string" ? raw.name : null);

  const image =
    (userRec && typeof userRec.image === "string" ? userRec.image : null) ??
    (typeof raw.picture === "string" ? raw.picture : null) ??
    (typeof raw.image === "string" ? raw.image : null);

  return { userId, googleId, email, name, image };
}
