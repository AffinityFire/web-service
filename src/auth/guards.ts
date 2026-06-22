import type { Context } from "@oak/oak";

/**
 * Route guards that enforce the MSAL session established by the auth flow
 * (req.session.isAuthenticated is set in AuthProvider.handleRedirect).
 */

/**
 * API guard: rejects unauthenticated requests with 401 JSON. Use for
 * programmatic / JSON endpoints where an HTTP redirect would be inappropriate.
 */
export async function requireAuth(
  ctx: Context,
  next: () => Promise<unknown>,
) {
  console.log("requireAuth");
  const isAuthenticated = ctx.state.session.get("isAuthenticated");
  console.log("isAuthenticated", isAuthenticated);
  if (!isAuthenticated) {
    ctx.response.status = 401;
    ctx.response.body = JSON.stringify({ message: "Unauthorized" });
    ctx.response.type = "application/json";
    return;
  }
  return await next();
}

/**
 * Page guard: redirects unauthenticated browser requests to the login page.
 * Use for HTML / single-page-app routes.
 */
export async function requireAuthPage(
  ctx: Context,
  next: () => Promise<unknown>,
) {
  const isAuthenticated = ctx.state.session.get("isAuthenticated");
  console.log("isAuthenticated", isAuthenticated);
  if (!isAuthenticated) {
    ctx.response.redirect("/login");
    return;
  }
  return await next();
}
