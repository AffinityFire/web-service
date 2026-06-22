import authProvider from "../auth/AuthProvider.ts";
import {
  GRAPH_ME_ENDPOINT,
  POST_LOGOUT_REDIRECT_URI,
  REDIRECT_URI,
} from "../authConfig.ts";
import type { Router } from "@oak/oak";
import type { AppState } from "../mod.ts";
import { requireAuth, requireAuthPage } from "../auth/guards.ts";
import { AccountInfo } from "@azure/msal-node";

export function buildAuthRouter(router: Router<AppState>) {
  router.get(
    "/auth/signin",
    authProvider.login({
      scopes: [],
      redirectUri: REDIRECT_URI,
      successRedirect: "/",
    }),
  );

  router.get(
    "/auth/acquireToken",
    authProvider.acquireToken({
      scopes: ["User.Read"],
      redirectUri: REDIRECT_URI,
      successRedirect: "/users/profile",
    }),
  );

  router.post("/auth/callback", authProvider.handleRedirect());

  // Switch user: re-run the sign-in flow but force the Microsoft account picker.
  router.get(
    "/auth/switch",
    authProvider.login({
      scopes: [],
      redirectUri: REDIRECT_URI,
      successRedirect: "/",
      prompt: "select_account",
    }),
  );

  // Sign out of Microsoft (and therefore every Microsoft-integrated app too).
  router.get(
    "/auth/signout",
    authProvider.logout({
      postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI,
    }),
  );

  // Sign out of this web service only — destroy the local session but keep the
  // user's Microsoft session intact.
  router.get(
    "/auth/signout/local",
    authProvider.logoutLocal({
      successRedirect: "/login",
    }),
  );
  router.get("/auth/status", function (ctx) {
    const isAuthenticated = ctx.state.session.get("isAuthenticated") as boolean;
    const account = ctx.state.session.get("account") as AccountInfo;
    ctx.response.body = JSON.stringify({
      title: "MSAL Node & Express Web App",
      isAuthenticated,
      username: account?.username,
    });
    ctx.response.type = "application/json";
  });

  // Protected: returns the authenticated user's account. Responds 401 when the
  // session is not authenticated.
  router.get("/auth/me", requireAuth, function (ctx) {
    ctx.response.body = JSON.stringify({ account: ctx.state.account });
    ctx.response.type = "application/json";
  });
  router.get(
    "/auth/users/id",
    requireAuthPage, // check if user is authenticated
    async function (ctx) {
      if (!ctx.state.account) throw new Error("no account");
      ctx.response.body = JSON.stringify({
        idTokenClaims: ctx.state.account.idTokenClaims,
      });
      ctx.response.type = "application/json";
    },
  );

  router.get(
    "/auth/users/profile",
    requireAuthPage, // check if user is authenticated
    async function (ctx) {
      if (!ctx.state.accessToken) throw new Error("no access token");
      const graphResponse = await fetch(
        GRAPH_ME_ENDPOINT,
        ctx.state.accessToken,
      );
      ctx.response.body = JSON.stringify({ profile: graphResponse });
      ctx.response.type = "application/json";
    },
  );
}
