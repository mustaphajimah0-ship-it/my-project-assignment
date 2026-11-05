const path = require("path");
const express = require("express");
const api = require("./routes/api");
const store = require("./lib/store");

function bindCloudFlush(res, next) {
  const json = res.json.bind(res);
  const send = res.send.bind(res);
  const end = res.end.bind(res);
  let opened = false;
  const persist = (write, args) => {
    if (opened) return write(...args);
    opened = true;
    store.cloudFlush().then(() => write(...args)).catch((error) => {
      res.json = json;
      res.send = send;
      res.end = end;
      next(error);
    });
    return res;
  };
  res.json = (body) => persist(json, [body]);
  res.send = (body) => persist(send, [body]);
  res.end = (...args) => persist(end, args);
}

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (!store.cloudEnabled()) return next();
    let release = () => {};
    let released = false;
    const finish = () => {
      if (released) return;
      released = true;
      release();
    };
    store.cloudAcquire().then((unlock) => {
      release = unlock;
      res.on("finish", finish);
      res.on("close", finish);
      return store.cloudReady();
    }).then(() => {
      bindCloudFlush(res, next);
      next();
    }).catch((error) => {
      finish();
      next(error);
    });
  });
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
