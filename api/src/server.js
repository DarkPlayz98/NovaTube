import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "novatube-api", version: "0.1.0" });
});

app.get("/api/config", (_req, res) => {
  res.json({
    name: "NovaTube",
    features: ["home", "search", "shorts", "live", "subscriptions", "history"],
    playback: "youtube-official"
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log("NovaTube API listening on port " + port);
});
