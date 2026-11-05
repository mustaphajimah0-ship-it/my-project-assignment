const path = require("path");
const express = require("express");
const api = require("./routes/api");
const store = require("./lib/store");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", api);
  app.use(express.static(path.join(__dirname, "public"), { index: "index.html", maxAge: 0 }));
  app.use((error, _req, res, _next) => {
    if (error && error.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON.", code: "invalid" });
    }
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    return res.status(status).json({
      error: status >= 500 ? "Something went wrong." : error.message,
      code: error.code || "error",
    });
  });
  return app;
}

function listen(port = Number(process.env.PORT) || 3000) {
  const app = createApp();
  return app.listen(port, () => {
    const club = store.getClub();
    console.log(`${club.name} operations listening on http://localhost:${port}`);
  });
}

if (require.main === module) listen();

module.exports = { createApp, listen };
