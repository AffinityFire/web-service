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
import {
  MemoryStore,
  PostgresStore,
  Session,
} from "@affinity-fire/oak-sessions";
import { requireAuth } from "./auth/guards.ts";
import { Client } from "@db/postgres";
import { type AppDbConn, dbMiddleware } from "./db.ts";

export type AppState = {
  session: Session;
};

export type AffAppState = AppState & { db?: AppDbConn };

export async function newApp<AS extends AppState>(
  appDir: string,
  appMod: (router: Router<AS>) => Promise<void>,
  opts?: { databaseUrl?: string; appName?: string },
): Promise<Application<AppState>> {
  let store;
  if (opts?.databaseUrl) {
    store = new PostgresStore(new Client(opts?.databaseUrl), "sessions_t");
    await store.initSessionsTable();
  } else {
    store = new MemoryStore();
  }

  const router = new Router<AppState>();
  buildRouter(router);
  router.use(authMiddleware);
  const apiRouter = new Router({ "prefix": "/api" });
  apiRouter.use(requireAuth);
  if (opts?.databaseUrl) {
    apiRouter.use(
      dbMiddleware(opts?.databaseUrl, opts?.appName ?? "Affinity App"),
    );
  }
  appMod(apiRouter);
  const app = new Application<AppState>();
  app.use(timerMiddleware);
  app.use(appStaticMiddleware(appDir));
  app.use(Session.initMiddleware(store));
  app.use(router.routes());
  app.use(router.allowedMethods());
  app.use(apiRouter.routes());
  app.use(apiRouter.allowedMethods());
  return app;
}
