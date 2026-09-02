#!/usr/bin/env node

import { Buffer } from "node:buffer";
import console from "node:console";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import process from "node:process";

const [bundlePath, projectPath] = process.argv.slice(2);
if (bundlePath === undefined || projectPath === undefined) {
  console.error("Usage: node bin/install-handoff.mjs <penpot_handoff.json> <flutter-project>");
  process.exitCode = 1;
} else {
  await install(bundlePath, projectPath);
}

async function install(bundlePath, projectPath) {
  const bundle = JSON.parse(await readFile(resolve(bundlePath), "utf8"));
  if (bundle.formatVersion !== 1 || !Array.isArray(bundle.files) || !Array.isArray(bundle.assets)) {
    throw new Error("Unsupported or malformed Penpot handoff bundle.");
  }
  const projectRoot = resolve(projectPath);
  const generatedRoot = resolve(projectRoot, "lib/generated/penpot");
  const assetRoot = resolve(projectRoot, "assets/penpot");
  await rm(generatedRoot, { recursive: true, force: true });
  await rm(assetRoot, { recursive: true, force: true });

  for (const file of bundle.files) {
    const target = safeTarget(projectRoot, file.path, "lib/generated/penpot/");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.source, "utf8");
  }
  for (const asset of bundle.assets) {
    const target = safeTarget(projectRoot, asset.filename, "assets/penpot/");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, asset.encoding === "base64" ? Buffer.from(asset.content, "base64") : asset.content);
  }

  console.log(`Installed ${bundle.files.length} generated files and ${bundle.assets.length} assets.`);
  if (bundle.integration?.pubspecSnippet) console.log(`\nMerge this generated integration metadata into pubspec.yaml:\n\n${bundle.integration.pubspecSnippet}`);
  for (const requirement of bundle.integration?.fontRequirements ?? []) console.log(`Font requirement: ${requirement}`);
}

function safeTarget(projectRoot, relativePath, requiredPrefix) {
  if (typeof relativePath !== "string" || !relativePath.startsWith(requiredPrefix)) {
    throw new Error(`Refusing path outside ${requiredPrefix}: ${String(relativePath)}`);
  }
  const target = resolve(projectRoot, relativePath);
  if (!target.startsWith(`${projectRoot}${sep}`)) throw new Error(`Refusing path outside the Flutter project: ${relativePath}`);
  return target;
}
