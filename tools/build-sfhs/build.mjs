import { build, createServer } from "vite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { resolve, relative, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2),
  get = (k, f) => {
    const i = args.indexOf(k);
    if (i < 0) return f;
    if (!args[i + 1] || args[i + 1].startsWith("--"))
      throw new Error("Missing " + k + " value");
    return args[i + 1];
  };
const synthetic = args.includes("--synthetic");
if (!synthetic && !args.includes("--assets"))
  throw new Error(
    "Choose --assets .private/imported or --synthetic explicitly; original data is never silently replaced",
  );
const sha = (b) => createHash("sha256").update(b).digest("hex");
let packBytes = null,
  pack = null;
let ruleExtensionBytes = null, ruleExtensionIdentity = null;
if (!synthetic) {
  const input = resolve(root, get("--assets", ".private/imported"));
  const path = input.endsWith(".gwpack")
    ? input
    : resolve(input, "genewars.gwpack");
  packBytes = await readFile(path);
  if (packBytes.length > 128 * 1024 * 1024) throw new Error("Pack too large");
  pack = JSON.parse(
    gunzipSync(packBytes, { maxOutputLength: 256 * 1024 * 1024 }),
  );
  if (
    ![1, 2].includes(pack.schemaVersion) ||
    pack.kind !== "original-private" ||
    pack.missions.length !== 24
  )
    throw new Error("Unsupported or incomplete mission pack");
}
if (args.includes("--rule-extension")) {
  if (!packBytes) throw Error("Rule extensions require an original base pack");
  ruleExtensionBytes = await readFile(resolve(root, get("--rule-extension")));
  const server=await createServer({root,configFile:false,server:{middlewareMode:true,hmr:false},appType:"custom",logLevel:"error"});
  try {
    const {admitPackRuleExtension}=await server.ssrLoadModule("/src/content/rule-extension.ts");
    const admitted=await admitPackRuleExtension(pack,sha(packBytes),new TextDecoder("utf-8",{fatal:true}).decode(ruleExtensionBytes),sha(ruleExtensionBytes));
    ruleExtensionIdentity=admitted.identity;
  } finally {await server.close();}
}
const output = resolve(
  root,
  get(
    "--out",
    synthetic ? "dist/genewars-synthetic.html" : "dist/genewars-sfhs.html",
  ),
);
if (
  !relative(resolve(root, "dist"), output) ||
  relative(resolve(root, "dist"), output).startsWith("..")
)
  throw new Error("HTML output must remain beneath ignored dist/");
const result = await build({
  root,
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  build: {
    write: false,
    minify: true,
    target: "es2022",
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
    cssCodeSplit: false,
    sourcemap: false,
  },
});
const files = Array.isArray(result)
  ? result.flatMap((r) => r.output)
  : result.output;
let html = String(
  files.find((f) => f.type === "asset" && f.fileName === "index.html").source,
);
const js = files.filter((f) => f.type === "chunk");
if (js.length !== 1) throw new Error("SFHS requires exactly one JS chunk");
const css = files
  .filter((f) => f.type === "asset" && f.fileName.endsWith(".css"))
  .map((f) => String(f.source))
  .join("\n");
const licenses = (
  await Promise.all(
    [
      "LICENSE",
      "NOTICE",
      "node_modules/three/LICENSE",
      "node_modules/zod/LICENSE",
    ].map(
      async (path) =>
        `=== ${path} ===\n${await readFile(resolve(root, path), "utf8")}`,
    ),
  )
).join("\n\n");
const notices = `<pre hidden id="gw-licenses">${licenses.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre>`;
html = html
  .replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/g, "")
  .replace(/<link\b[^>]*href="[^"]+\.css"[^>]*>/g, "");
const content = packBytes
  ? `<script id="gw-pack" type="application/octet-stream" data-sha256="${sha(packBytes)}">${packBytes.toString("base64")}</script>${ruleExtensionBytes?`<script id="gw-rule-extension" type="application/octet-stream" data-sha256="${sha(ruleExtensionBytes)}">${ruleExtensionBytes.toString("base64")}</script>`:""}`
  : "";
// A replacement callback preserves literal $&, $` and $' inside bundled JS.
html = html
  .replace("</head>", () => `<style>${css}</style></head>`)
  .replace(
    "</body>",
    () =>
      `${notices}${content}<script type="module">${js[0].code.replace(/<\/script/gi, "<\\/script")}</script></body>`,
  );
if (
  /\b(?:src|href)=["'](?:https?:|\/assets)/i.test(html) ||
  /\bon\w+=["']/i.test(html)
)
  throw new Error("External runtime reference or inline event handler");
await mkdir(dirname(output), { recursive: true });
let commit = null,
  dirty = true;
try {
  const git = [
    "-c",
    `safe.directory=${root.replaceAll("\\", "/")}`,
    "-C",
    root,
  ];
  commit = execFileSync("git", [...git, "rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  dirty = !!execFileSync("git", [...git, "status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
} catch {}
html = html.replace(
  "</body>",
  () =>
    `<script type="application/json" id="gw-build-meta">${JSON.stringify({ commit, dirty, engineVersion: "0.2.0-campaign-development", acceptedMissions: 6 })}</script></body>`,
);
await writeFile(output, html);
const receipt = {
  schemaVersion: 1,
  sourceCommit: commit,
  sourceDirty: dirty,
  buildVersion: "0.2.0-campaign-development",
  contentSchemaVersion: pack?.schemaVersion || 1,
  // Exceland accepted through the real UI at phone-landscape915x412 and
  // phone-portrait412x915 with touch input: mine, distributor and three photon
  // processors built by ordinary construction commands, victory-notification,
  // result view, continue and Krell initialization. Physical S21 QA is separate.
  //
  // Krell is accepted on the same route: Extractor, First Stage Distributor and
  // Gene Pod built by ordinary commands, Genepod Mules produced from the
  // Economy panel, each Mule selected in Units and herded with the "Show zone 1"
  // camera affordance plus a ground tap. Victory is source-backed on the
  // marked-zone ranking: the ledger reads 1024/1000 terrain score and 1/1 zones
  // finished, then the result view continues into Madami at progress2.
  // Verified at 915x412, 412x915 and 1440x900 (touch and mouse paths).
  // Madami is accepted on the same UI path: three grade-0 Recycling Plants built
  // over open terrain inside the carried distributor's radius at (64,109) for
  // 238 each, plus a fourth at (62,104) that only supplies capacity, then Mules
  // produced with the two-pool debit (funds first, then GOOP) to haul biomass.
  // Final state: capacity 1600, stored GOOP 1425/1400, phase "result" with
  // result.phase "victory-notification" and terminal kind "won"; "View result"
  // then "Continue to next mission" carried progress2 into progress3.
  // Verified at 980x1400 touch viewport.
  // Roach: genuine marked-zone ranking win at frame50433, score2579/2390,
  // phone-landscape touch result/carry into Brown, then portrait save reload.
  // Private acceptance receipt: continuous-20261026/mission4-acceptance.json.
  // Lunacon: portrait touch win at frame18817, score2583/568, ordinary result
  // and carry into Oid, landscape reload and exact carry replay verified.
  // Private acceptance receipt: continuous-20261026/mission6-acceptance.json.
  acceptedMissionCount: 6,
  ruleExtension: ruleExtensionIdentity,
  physicalDeviceAcceptance: "not-run",
  upstreamBattleDrones: "39d6f587f98a82f5c0426e8bd476cef49fd19ef0",
  importerVersion: pack?.importerVersion || null,
  variant: pack?.source.variant || "synthetic",
  inputSha256: pack?.source.sha256 || null,
  originalExecutableSha256: pack?.source.executableSha256 || null,
  packSha256: packBytes ? sha(packBytes) : null,
  output: basename(output),
  outputBytes: Buffer.byteLength(html),
  outputSha256: sha(html),
  completeCampaign: false,
  tests:
    "See .private/verification.json and browser reports; building alone does not assert test success",
};
await writeFile(
  output + ".receipt.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt));
