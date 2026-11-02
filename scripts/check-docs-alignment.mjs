#!/usr/bin/env node
/**
 * Fail when shared/contracts or practice docs drift from code.
 * Run from repo root: node scripts/check-docs-alignment.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function read(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) {
    errors.push(`missing file: ${rel}`);
    return null;
  }
  return readFileSync(path, "utf8");
}

function mustInclude(rel, needles, label) {
  const text = read(rel);
  if (text === null) return;
  for (const needle of needles) {
    if (!text.includes(needle)) {
      errors.push(`${label}: ${rel} must mention \`${needle}\``);
    }
  }
}

function extract(re, text, label) {
  const m = text.match(re);
  if (!m) {
    errors.push(`could not parse ${label}`);
    return null;
  }
  return m[1];
}

const identityRaw = read("shared/contracts/identity.json");
if (!identityRaw) {
  console.error(errors.join("\n"));
  process.exit(1);
}

let identity;
try {
  identity = JSON.parse(identityRaw);
} catch (e) {
  console.error(`shared/contracts/identity.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

const androidGradle = read("android/app/build.gradle.kts") || "";
const apkGradle = read("android-apk/app/build.gradle") || "";
const capacitor = read("food-recall-app/capacitor.config.json") || "";
const iosYml = read("ios/project.yml") || "";

const codeNativeId = extract(/applicationId\s*=\s*"([^"]+)"/, androidGradle, "android applicationId");
const codeApkId = extract(/applicationId\s+"([^"]+)"/, apkGradle, "android-apk applicationId");
let codeCapAppId = null;
try {
  codeCapAppId = JSON.parse(capacitor).appId;
} catch {
  errors.push("food-recall-app/capacitor.config.json is not valid JSON");
}
const codeIosBundle = extract(/PRODUCT_BUNDLE_IDENTIFIER:\s*(\S+)/, iosYml, "ios bundle id");

if (codeNativeId && identity.nativeAndroid?.applicationId !== codeNativeId) {
  errors.push(
    `identity.json nativeAndroid.applicationId (${identity.nativeAndroid?.applicationId}) != code (${codeNativeId})`,
  );
}
if (codeApkId && identity.capacitorSideload?.applicationId !== codeApkId) {
  errors.push(
    `identity.json capacitorSideload.applicationId (${identity.capacitorSideload?.applicationId}) != code (${codeApkId})`,
  );
}
if (codeCapAppId && identity.capacitorSideload?.capacitorAppId !== codeCapAppId) {
  errors.push(
    `identity.json capacitorSideload.capacitorAppId (${identity.capacitorSideload?.capacitorAppId}) != code (${codeCapAppId})`,
  );
}
if (codeCapAppId && codeApkId && codeCapAppId !== codeApkId) {
  errors.push(`Capacitor appId (${codeCapAppId}) must match android-apk applicationId (${codeApkId})`);
}
if (codeIosBundle && identity.ios?.bundleId !== codeIosBundle) {
  errors.push(`identity.json ios.bundleId (${identity.ios?.bundleId}) != code (${codeIosBundle})`);
}

// Sideload and Play/native must not share a package name.
if (codeNativeId && codeApkId && codeNativeId === codeApkId) {
  errors.push(
    `applicationId collision: native android/ and Capacitor android-apk/ both use ${codeNativeId}. ` +
      `Give the sideload APK a distinct id (see docs/practices/release.md).`,
  );
}

const practiceFiles = [
  "docs/practices/README.md",
  "docs/practices/ci.md",
  "docs/practices/release.md",
  "docs/practices/onboarding.md",
  "AGENTS.md",
  "CLAUDE.md",
];
for (const rel of practiceFiles) {
  if (!existsSync(join(root, rel))) errors.push(`missing practice/agent surface: ${rel}`);
}

mustInclude("CLAUDE.md", ["@AGENTS.md"], "agent import");
mustInclude("AGENTS.md", ["docs/practices/", "shared/contracts/"], "AGENTS.md index");
mustInclude("docs/practices/ci.md", [".github/workflows/ci.yml"], "CI practice guide");
mustInclude("docs/practices/release.md", ["shared/contracts/identity.json"], "release practice guide");
mustInclude("docs/practices/onboarding.md", ["AGENTS.md", "CONTRIBUTING.md"], "onboarding practice guide");

if (identity.nativeAndroid?.applicationId) {
  mustInclude(
    "docs/practices/release.md",
    [identity.nativeAndroid.applicationId],
    "release guide native id",
  );
}
if (identity.capacitorSideload?.applicationId) {
  mustInclude(
    "docs/practices/release.md",
    [identity.capacitorSideload.applicationId],
    "release guide sideload id",
  );
}

// --- CI contract (additive; identity checks above are unchanged) ---
const ciRaw = read("shared/contracts/ci.json");
let ci = null;
if (ciRaw) {
  try {
    ci = JSON.parse(ciRaw);
  } catch (e) {
    errors.push(`shared/contracts/ci.json is not valid JSON: ${e.message}`);
  }
}

const ciYml = read(".github/workflows/ci.yml") || "";
const securityYml = read(".github/workflows/security.yml") || "";
const pagesYml = read(".github/workflows/pages.yml") || "";

if (ci) {
  const nodeVer = ci.nodeVersion;
  if (nodeVer == null) {
    errors.push("ci.json missing nodeVersion");
  } else {
    const nodeNeedle = `node-version: ${nodeVer}`;
    if (!ciYml.includes(nodeNeedle)) {
      errors.push(`ci.yml must set \`${nodeNeedle}\` (ci.json nodeVersion)`);
    }
    if (pagesYml && !pagesYml.includes(nodeNeedle)) {
      errors.push(`pages.yml must set \`${nodeNeedle}\` (ci.json nodeVersion)`);
    }
  }

  const javaVer = ci.javaVersion;
  if (javaVer != null) {
    const javaNeedle = `java-version: ${javaVer}`;
    if (!ciYml.includes(javaNeedle)) {
      errors.push(`ci.yml must set \`${javaNeedle}\` (ci.json javaVersion)`);
    }
  }

  const contexts = Array.isArray(ci.protectedStatusContexts) ? ci.protectedStatusContexts : null;
  if (!contexts || contexts.length === 0) {
    errors.push("ci.json protectedStatusContexts must be a non-empty array");
  } else {
    for (const name of contexts) {
      // Match the workflow job display name line exactly.
      if (!ciYml.includes(`name: ${name}`)) {
        errors.push(`ci.yml missing protected status context \`name: ${name}\``);
      }
      mustInclude("docs/practices/ci.md", [name], "CI practice guide protected context");
    }
  }

  if (Array.isArray(ci.jobs)) {
    for (const job of ci.jobs) {
      if (!job?.id || !job?.name) {
        errors.push("ci.json jobs entries need id and name");
        continue;
      }
      // Job id appears as a top-level key under jobs:
      const escapedId = job.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const idRe = new RegExp(`^  ${escapedId}:\\s*$`, "m");
      if (!idRe.test(ciYml)) {
        errors.push(`ci.yml missing job id \`${job.id}\``);
      }
      if (!ciYml.includes(`name: ${job.name}`)) {
        errors.push(`ci.yml job \`${job.id}\` missing \`name: ${job.name}\``);
      }
    }
  }

  if (ci.alignmentScript) {
    mustInclude("docs/practices/ci.md", [ci.alignmentScript], "CI practice guide alignment script");
    if (!ciYml.includes(ci.alignmentScript)) {
      errors.push(`ci.yml must run \`${ci.alignmentScript}\``);
    }
  }

  if (ci.alignmentJobName) {
    mustInclude(
      "docs/practices/ci.md",
      [ci.alignmentJobName],
      "CI practice guide alignment job name",
    );
  }

  if (ci.securityWorkflow) {
    mustInclude("docs/practices/ci.md", [ci.securityWorkflow], "CI practice guide security workflow");
    if (!existsSync(join(root, ci.securityWorkflow))) {
      errors.push(`missing security workflow: ${ci.securityWorkflow}`);
    }
  }

  if (ci.pagesWorkflow && !existsSync(join(root, ci.pagesWorkflow))) {
    errors.push(`missing pages workflow: ${ci.pagesWorkflow}`);
  }

  if (securityYml && !securityYml.includes("jacobrakaiFoundation/.github/.github/workflows/security-scan.yml")) {
    errors.push("security.yml must call the org reusable security-scan workflow");
  }

  mustInclude(
    "docs/practices/ci.md",
    ["draft", "Conventional Commits", "core.hooksPath", ".githooks/commit-msg"],
    "CI practice guide hygiene topics",
  );
}

if (errors.length) {
  console.error("docs alignment check failed:\n");
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

console.log("docs alignment check passed");
