const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "functions");
fs.mkdirSync(dest, { recursive: true });

for (const entry of ["lib", "routes"]) {
  fs.cpSync(path.join(root, entry), path.join(dest, entry), { recursive: true, force: true });
}
fs.copyFileSync(path.join(root, "server.js"), path.join(dest, "server.js"));
