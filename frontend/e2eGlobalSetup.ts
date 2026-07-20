import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveE2eDatabaseName } from "./e2eRuntime";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const apiPort = Number(process.env.E2E_API_PORT ?? 58001);
const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 58173);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;

type ServerRecord = {
  apiPid: number;
  frontendPid: number;
  apiPort: number;
  frontendPort: number;
};

async function globalSetup() {
  const api = startServer("api", [
    resolve(repoRoot, "apps/api/node_modules/tsx/dist/cli.mjs"),
    resolve(repoRoot, "apps/api/src/server.ts")
  ], {
    NODE_ENV: "test",
    PORT: String(apiPort),
    MONGODB_DB: resolveE2eDatabaseName(),
    DEMO_CONTROLS_ENABLED: "true",
    BEDROCK_ENABLED: "false",
    AI_PROVIDER_ORDER: "",
    GEMINI_API_KEY: ""
  }, repoRoot);

  try {
    await waitForUrl(`${apiUrl}/health`, 120_000);

    const frontend = startServer("frontend", [
      resolve(here, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(frontendPort)
    ], {
      SARTHI_API_TARGET: apiUrl,
      SARTHI_FRONTEND_PORT: String(frontendPort)
    }, here);

    try {
      await waitForUrl(frontendUrl, 120_000);
      writeFileSync(serverRecordPath(), JSON.stringify({
        apiPid: requirePid(api),
        frontendPid: requirePid(frontend),
        apiPort,
        frontendPort
      } satisfies ServerRecord, null, 2));
    } catch (error) {
      killProcessTree(frontend);
      throw error;
    }
  } catch (error) {
    killProcessTree(api);
    throw error;
  }
}

function startServer(name: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "ignore",
    windowsHide: true,
    detached: process.platform !== "win32"
  });

  child.once("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      process.stderr.write(`[e2e] ${name} exited early with code ${code}\n`);
    } else if (signal) {
      process.stderr.write(`[e2e] ${name} exited early with signal ${signal}\n`);
    }
  });

  return child;
}

function requirePid(child: ChildProcess) {
  if (!child.pid) throw new Error("Could not read spawned server pid.");
  return child.pid;
}

async function waitForUrl(url: string, timeoutMs: number) {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if ([200, 204, 301, 302, 304, 400, 401, 402, 403].includes(response.status)) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function serverRecordPath() {
  const dir = resolve(tmpdir(), "sarthi-e2e");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return resolve(dir, `servers-${apiPort}-${frontendPort}.json`);
}

function killProcessTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      // Already stopped.
    }
  }
}

export default globalSetup;
