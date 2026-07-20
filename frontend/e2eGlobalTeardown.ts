import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const apiPort = Number(process.env.E2E_API_PORT ?? 58001);
const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 58173);

type ServerRecord = {
  apiPid: number;
  frontendPid: number;
  apiPort: number;
  frontendPort: number;
};

async function globalTeardown() {
  const path = serverRecordPath();
  if (!existsSync(path)) return;
  const record = JSON.parse(readFileSync(path, "utf8")) as ServerRecord;
  for (const pid of [record.frontendPid, record.apiPid]) {
    killPidTree(pid);
  }
  rmSync(path, { force: true });
}

function serverRecordPath() {
  return resolve(tmpdir(), "sarthi-e2e", `servers-${apiPort}-${frontendPort}.json`);
}

function killPidTree(pid: number) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already stopped.
    }
  }
}

export default globalTeardown;
