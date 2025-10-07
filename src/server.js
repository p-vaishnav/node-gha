import express from "express";
import fs from "fs/promises";
import path from "path";
import morgan from "morgan";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

const META_PATH = path.join(__dirname, "..", "meta-data.json");

app.get("/meta-data", async (_req, res) => {
  try {
    const raw = await fs.readFile(META_PATH, "utf8");
    const data = JSON.parse(raw);
    res.status(200).json(data);
  } catch (err) {
    console.error("Failed to read meta-data.json:", err);
    res.status(500).json({ error: "Failed to read meta-data" });
  }
});

app.get("/healthz", (_req, res) => res.send("ok"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`metadata server listening on :${PORT}`);
});
