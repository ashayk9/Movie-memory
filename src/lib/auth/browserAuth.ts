/**
 * Auth.js route handlers live at /api/auth/* (see app/api/auth/[...nextauth]/route.ts).
 * Do not use `next-auth@4` `signIn`/`signOut` here: that package targets the legacy
 * NextAuth v4 API and fails against @auth/nextjs ("Failed to fetch").
 */
const AUTH_BASE = "/api/auth";

export async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(`${AUTH_BASE}/csrf`, { credentials: "include" });
  if (!res.ok) throw new Error(`CSRF failed (${res.status})`);
  const data = (await res.json()) as { csrfToken?: string };
  if (!data.csrfToken) throw new Error("CSRF token missing");
  return data.csrfToken;
}

function postForm(action: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/** Starts Google OAuth; full page navigation. */
export async function browserSignInGoogle(callbackUrl: string) {
  const csrfToken = await fetchCsrfToken();
  postForm(`${AUTH_BASE}/signin/google`, { csrfToken, callbackUrl });
}

/** Ends session; full page navigation. */
export async function browserSignOut(callbackUrl: string) {
  const csrfToken = await fetchCsrfToken();
  postForm(`${AUTH_BASE}/signout`, { csrfToken, callbackUrl });
}
