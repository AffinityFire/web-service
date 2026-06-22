/**
 * Module dependencies.
 */

// Load environment variables before any other module reads process.env.
import { Application, Router } from "@oak/oak";
import {
  appStaticMiddleware,
  authMiddleware,
  timerMiddleware,
} from "./middleware/mod.ts";
import { buildRouter } from "./app.ts";
import { MemoryStore, Session } from "@affinity-fire/oak-sessions";
import { requireAuth } from "./auth/guards.ts";

export type AppState = {
  session: Session;
};

export function newApp<AS extends AppState>(
  appDir: string,
  appMod: (router: Router<AS>) => Promise<void>,
): Application<AppState> {
  const store = new MemoryStore();
  const router = new Router<AppState>();
  buildRouter(router);
  router.use(authMiddleware);
  const apiRouter = new Router({ "prefix": "/api" });
  apiRouter.use(requireAuth);
  appMod(apiRouter);
  const app = new Application<AppState>();
  app.use(timerMiddleware);
  app.use(appStaticMiddleware(appDir));
  // app.use(dbMiddleware);
  app.use(Session.initMiddleware(store));
  app.use(router.routes());
  app.use(router.allowedMethods());
  app.use(apiRouter.routes());
  app.use(apiRouter.allowedMethods());
  return app;
}
