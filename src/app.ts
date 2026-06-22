import { buildAuthRouter } from "./routes/auth.ts";

import type { Context, Router } from "@oak/oak";
import type { AppState } from "./mod.ts";
import { loginHtml } from "./login/html.ts";

export interface AppError extends Error {
  status?: number;
}

export interface AuthCodeUrlRequestParams {
  state: string;
  scopes: string[];
  redirectUri: string | undefined;
}

export function buildRouter(router: Router<AppState>) {
  // Public login page (anonymous): a landing page offering Microsoft sign-in.
  router.get("/login", async function (ctx: Context) {
    ctx.response.body = loginHtml;
    ctx.response.type = "text/html";
  });

  buildAuthRouter(router);
}
