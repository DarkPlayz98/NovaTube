import { app, initDb } from "../src/server.js";

let databaseReady;

export default async function handler(req, res) {
  if (!databaseReady) {
    databaseReady = initDb().catch((error) => {
      console.error("Database initialization failed:", error.message);
    });
  }
  await databaseReady;
  return app(req, res);
}
