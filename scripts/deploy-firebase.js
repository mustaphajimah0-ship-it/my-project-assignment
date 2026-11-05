const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

require("./stage-functions");

const root = path.join(__dirname, "..");
const project = process.env.FIREBASE_PROJECT || "";
const hasProject = Boolean(project) || fs.existsSync(path.join(root, ".firebaserc"));
if (!hasProject) {
  console.error("ACE FITNESS needs a Firebase project before it can be deployed.");
  console.error("Sign in, then attach the project:");
  console.error("  npx firebase-tools@15 login");
  console.error("  npx firebase-tools@15 use --add");
  console.error("  npm run deploy");
  process.exit(1);
}

const args = ["--yes", "firebase-tools@15", "deploy", "--only", "functions,hosting,storage", "--non-interactive"];
if (project) args.push("--project", project);
const result = spawnSync("npx", args, { cwd: root, stdio: "inherit" });
process.exit(result.status === null ? 1 : result.status);
