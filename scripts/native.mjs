import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";

const mode = process.argv[2];
function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, CARGO_BUILD_JOBS: "2" },
    shell: process.platform === "win32" && command === "npm",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (process.platform === "win32") {
  mkdirSync("target/helpers", { recursive: true });
  for (const [architecture, target] of [
    ["x86", "i686-pc-windows-msvc"],
    ["x64", "x86_64-pc-windows-msvc"],
  ]) {
    run("rustup", ["target", "add", target]);
    run("cargo", [
      "build",
      "-p",
      "cardiag-j2534",
      "--bin",
      "cardiag-j2534",
      "--release",
      "--locked",
      "--target",
      target,
    ]);
    const name = `cardiag-j2534-${architecture}.exe`;
    for (const directory of [
      "target/helpers",
      "target/debug",
      "target/release",
    ]) {
      mkdirSync(directory, { recursive: true });
      copyFileSync(
        `target/${target}/release/cardiag-j2534.exe`,
        `${directory}/${name}`,
      );
    }
  }
}
if (mode === "dev") run("npm", ["run", "dev"]);
else if (mode === "build") run("npm", ["run", "build"]);
