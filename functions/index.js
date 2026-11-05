const { onRequest } = require("firebase-functions/v2/https");
const { createApp } = require("./server");

exports.api = onRequest({
  region: "europe-west1",
  memory: "512MiB",
  timeoutSeconds: 60,
  maxInstances: 1,
  concurrency: 1,
  invoker: "public",
}, createApp());
