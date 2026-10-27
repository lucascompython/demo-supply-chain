import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = join(root, "docs/evidencias");
mkdirSync(evidence, { recursive: true });
const cases = [
  {
    name: "01-normal",
    branch: "normal",
    installLeak: false,
    runtimeLeak: false,
  },
  {
    name: "02-comprometida",
    branch: "comprometida",
    installLeak: true,
    runtimeLeak: true,
  },
  {
    name: "03-so-ignore-scripts",
    branch: "comprometida",
    ignore: true,
    installLeak: false,
    runtimeLeak: true,
  },
  {
    name: "04-corrigida",
    branch: "corrigida",
    installLeak: false,
    runtimeLeak: false,
  },
  { name: "05-integridade", branch: "corrigida", tamper: true },
  {
    name: "06-npm12-sem-aprovacao",
    branch: "comprometida",
    unapproved: true,
    installLeak: false,
    runtimeLeak: true,
  },
];

function command(cmd, args, cwd, env, log) {
  const result = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 60000,
  });
  if (result.error) throw result.error;
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  appendFileSync(
    log,
    `$ ${cmd} ${args.join(" ")}\n${output}[exit=${result.status}]\n\n`,
  );
  return { code: result.status, output };
}

for (const test of cases) {
  const sandbox = mkdtempSync(join(tmpdir(), "mathlib-demo-"));
  const log = join(evidence, `${test.name}.txt`);
  const revision = spawnSync(
    "git",
    ["rev-parse", `${test.branch}:app`, `${test.branch}:mathlib`],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(revision.status, 0, `Branch em falta: ${test.branch}`);
  writeFileSync(
    log,
    `Ensaio: ${test.name}\nBranch: ${test.branch}\nApp (tree): ${revision.stdout.trim().split("\n")[0]}\nMathlib (tree): ${revision.stdout.trim().split("\n")[1]}\nData UTC: ${new Date().toISOString()}\n\n`,
  );
  try {
    const archive = spawnSync("git", ["archive", test.branch], { cwd: root });
    assert.equal(archive.status, 0);
    const unpack = spawnSync("tar", ["-x", "-C", sandbox], {
      input: archive.stdout,
    });
    assert.equal(unpack.status, 0);
    const app = join(sandbox, "app");
    const sample = readFileSync(join(app, ".env.example"), "utf8").trim();
    copyFileSync(join(app, ".env.example"), join(app, ".env"));
    const env = {
      ...process.env,
      npm_config_cache: join(sandbox, ".npm-cache"),
      NO_COLOR: "1",
    };
    const run = (cmd, args, cwd = app) => command(cmd, args, cwd, env, log);
    for (const [cmd, args] of [
      ["node", ["--version"]],
      ["npm", ["--version"]],
      ["git", ["--version"]],
      ["uname", ["-srmo"]],
    ]) {
      const result = run(cmd, args);
      assert.equal(result.code, 0);
      if (cmd === "npm")
        assert.match(
          result.output.trim(),
          /^12\./,
          "Selecionar npm 12 antes do ensaio",
        );
    }
    const config = run("npm", ["config", "get", "ignore-scripts"]);
    assert.equal(config.code, 0);
    assert.equal(
      config.output.trim(),
      test.branch === "corrigida" ? "true" : "false",
    );
    if (test.unapproved) {
      assert.equal(run("npm", ["pkg", "delete", "allowScripts"]).code, 0);
    }
    if (test.tamper) {
      const manifest = JSON.parse(
        readFileSync(join(app, "package.json"), "utf8"),
      );
      const target = resolve(
        app,
        manifest.dependencies.mathlib.slice("file:".length),
      );
      // alterar so esta copia temporaria, manter uma gzip valida e o hash antigo
      appendFileSync(target, Buffer.from([0]));
    }
    const args = [
      "ci",
      "--offline",
      "--foreground-scripts",
      "--no-audit",
      "--no-fund",
    ];
    if (test.ignore) args.push("--ignore-scripts");
    const install = run("npm", args);
    if (test.tamper) {
      assert.notEqual(install.code, 0, "Artefacto alterado foi aceite");
      assert.match(install.output, /EINTEGRITY/);
    } else {
      assert.equal(install.code, 0, install.output);
      assert.equal(
        install.output.includes("[DEMO:postinstall]"),
        test.installLeak,
      );
      assert.equal(install.output.includes(`"${sample}"`), test.installLeak);
      const start = run("npm", ["start"]);
      assert.equal(start.code, 0, start.output);
      assert.equal(
        start.output.includes("[DEMO:runtime:add]"),
        test.runtimeLeak,
      );
      assert.equal(start.output.includes(`"${sample}"`), test.runtimeLeak);
      for (const result of [
        "2 + 3 = 5",
        "9 - 4 = 5",
        "6 * 7 = 42",
        "8 / 2 = 4",
      ]) {
        assert.ok(
          start.output.includes(result),
          `Resultado em falta: ${result}`,
        );
      }
      if (test.unapproved) {
        const pending = run("npm", [
          "approve-scripts",
          "--allow-scripts-pending",
        ]);
        assert.equal(pending.code, 0);
        assert.match(pending.output, /mathlib/);
      }
      assert.equal(readFileSync(join(app, ".env"), "utf8").trim(), sample);
      if (!test.installLeak && !test.runtimeLeak) {
        for (const line of sample.split("\n")) {
          const value = line.slice(line.indexOf("=") + 1);
          assert.ok(
            !(install.output + start.output).includes(value),
            `Valor exposto: ${line}`,
          );
        }
      }
    }
    appendFileSync(log, "RESULTADO: PASS\n");
    console.log(`PASS ${test.name}`);
  } catch (error) {
    appendFileSync(log, `RESULTADO: FAIL\n${error.stack}\n`);
    throw error;
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}
console.log("6/6 ensaios passaram. Registos em docs/evidencias/.");
