import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const privateRun = process.argv.includes("--private"),
  commands = [];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(args) {
  const r = spawnSync(npm, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
  commands.push({
    command: "npm " + args.join(" "),
    exitCode: r.status,
    output: r.stdout + r.stderr,
  });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  if (r.status !== 0) throw new Error("Verification command failed");
}
mkdirSync(".private", { recursive: true });
try {
  run(["run", "check"]);
  run(["run", "build:sfhs", "--", "--synthetic"]);
  run(["run", "test:browser"]);
  if (privateRun) {
    run(["run", "build:sfhs", "--", "--assets", ".private/imported"]);
    run(["run", "test:browser", "--", "--private"]);
  }
  for (const kind of ["synthetic", ...(privateRun ? ["private"] : [])]) {
    const browser = JSON.parse(
      readFileSync(
        kind === "private"
          ? ".private/browser-private/report.json"
          : "test-results/browser-synthetic/report.json",
        "utf8",
      ),
    );
    const path =
      kind === "private"
        ? "dist/genewars-sfhs.html.receipt.json"
        : "dist/genewars-synthetic.html.receipt.json";
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    if (browser.artifactSha256 !== receipt.outputSha256)
      throw new Error("Browser report is for a different artifact");
    receipt.validation = {
      status: "pass",
      commands: commands.map(({ command, exitCode }) => ({
        command,
        exitCode,
      })),
      browserArtifactSha256: browser.artifactSha256,
      viewports: browser.results.map((r) => r.viewport),
      unexpectedNetworkRequests: browser.results.flatMap(
        (r) => r.networkRequests,
      ).length,
      realPhoneAcceptance: false,
      completeCampaign: false,
    };
    writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
  }
  writeFileSync(
    ".private/verification.json",
    JSON.stringify(
      {
        status: "pass",
        commands,
        completeCampaign: false,
        realPhoneAcceptance: false,
      },
      null,
      2,
    ) + "\n",
  );
} catch (e) {
  writeFileSync(
    ".private/verification.json",
    JSON.stringify({ status: "fail", commands, error: String(e) }, null, 2) +
      "\n",
  );
  throw e;
}
