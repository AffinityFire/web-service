import { type Context, send } from "@oak/oak";
import type { AppState } from "@affinity-fire/web-service";
import { requireAuth } from "../auth/guards.ts";

export async function timerMiddleware(
  ctx: Context,
  next: () => Promise<unknown>,
) {
  const t1 = performance.now();
  const resp = await next();
  const t2 = performance.now();
  if (t2 - t1 > 5) {
    console.log(`${(t2 - t1).toFixed(1)} ms ${ctx.request.url}`);
  }
  return resp;
}

export async function authMiddleware(
  ctx: Context<AppState>,
  next: () => Promise<unknown>,
) {
  if (ctx.request.url.pathname.startsWith("/auth/")) return await next();
  return requireAuth(ctx, next);
}

export function appStaticMiddleware(appDir: string) {
  return async (
    ctx: Context,
    next: () => Promise<unknown>,
  ) => {
    const pathname = ctx.request.url.pathname;
    if (
      pathname.startsWith("/api/") || pathname.startsWith("/auth/") ||
      pathname.startsWith("/login")
    ) {
      return await next();
    }
    const filePath = pathname;
    try {
      console.log("sending", filePath);
      await send(ctx, filePath, { root: appDir, index: "index.html" });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (err instanceof Deno.errors.NotFound || status === 404) {
        // Unknown path with no matching asset: let the SPA route it.
        await send(ctx, "/index.html", { root: appDir });
      } else {
        throw err;
      }
    }
  };
}
