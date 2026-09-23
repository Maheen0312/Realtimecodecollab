import express, { Request, Response, NextFunction } from "express";
import http from "http";
import path from "path";
import vm from "vm";
import { exec, execFile, execSync, spawn, ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { GoogleGenAI } from "@google/genai";
import * as Y from "yjs";
import { detectProject } from "./src/utils/projectDetector";

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "code-collab-secret-key-2026";

// Dedicated workspace directory for each room on disk
const WORKSPACES_BASE_DIR = fs.existsSync("/workspace")
  ? "/workspace/workspaces"
  : path.join(os.tmpdir(), "code_death_workspaces");
if (!fs.existsSync(WORKSPACES_BASE_DIR)) {
  fs.mkdirSync(WORKSPACES_BASE_DIR, { recursive: true });
}

// Room persistent terminal sessions
interface RoomTerminalSession {
  roomId: string;
  projectRoot: string;
  cwd: string;
  relCwd: string;
}
const roomTerminalSessions = new Map<string, RoomTerminalSession>();

function getRoomTerminalSession(roomId: string): RoomTerminalSession {
  const projectRoot = getRoomDiskDir(roomId);
  let session = roomTerminalSessions.get(roomId);
  if (!session || !fs.existsSync(session.cwd)) {
    session = {
      roomId,
      projectRoot,
      cwd: projectRoot,
      relCwd: "",
    };
    roomTerminalSessions.set(roomId, session);
  }
  return session;
}

// Authoritative Yjs documents map: docId -> Y.Doc
const roomYDocs = new Map<string, Y.Doc>();

function getYDocForDocument(roomId: string, docId: string, initialContent?: string): Y.Doc {
  let doc = roomYDocs.get(docId);
  if (!doc) {
    doc = new Y.Doc();
    const ytext = doc.getText("codemirror");

    const room = rooms.get(roomId);
    let contentToSeed = initialContent || "";
    if (room) {
      const match = docId.match(/:file:(.+)$/);
      const filePath = match ? match[1] : "";
      const file = Array.from(room.files.values()).find((f) => f.path === filePath || f.id === filePath);
      if (file && file.content) {
        contentToSeed = file.content;
      }
    }

    if (contentToSeed && ytext.length === 0) {
      ytext.insert(0, contentToSeed);
    }

    // When the doc is updated, sync back to room.files and to disk
    doc.on("update", () => {
      const currentText = ytext.toString();
      const match = docId.match(/:file:(.+)$/);
      const filePath = match ? match[1] : "";
      if (room && filePath) {
        const file = Array.from(room.files.values()).find((f) => f.path === filePath || f.id === filePath);
        if (file) {
          file.content = currentText;
          file.updatedAt = new Date().toISOString();
          room.lastUpdated = file.updatedAt;

          // Sync to disk
          const diskPath = path.join(getRoomDiskDir(roomId), file.path);
          try {
            fs.mkdirSync(path.dirname(diskPath), { recursive: true });
            fs.writeFileSync(diskPath, currentText, "utf8");
          } catch (e) {}
        }
      }
    });

    roomYDocs.set(docId, doc);
  }
  return doc;
}

function getRoomDiskDir(roomId: string): string {
  const safeId = (roomId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = path.join(WORKSPACES_BASE_DIR, safeId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Guarantee project isolation: never symlink global host node_modules
  const nmPath = path.join(dir, "node_modules");
  try {
    if (fs.existsSync(nmPath) && fs.lstatSync(nmPath).isSymbolicLink()) {
      fs.unlinkSync(nmPath);
    }
  } catch (e) {}
  return dir;
}

function getLanguageFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
    case "mjs":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "py":
      return "python";
    case "html":
      return "html";
    case "css":
    case "scss":
      return "css";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "c":
    case "cpp":
    case "h":
    case "hpp":
      return "cpp";
    case "java":
      return "java";
    default:
      return "plaintext";
  }
}

function replaceWorkspaceOnDisk(roomId: string, files: ServerProjectFile[]) {
  const roomDir = getRoomDiskDir(roomId);
  try {
    fs.rmSync(roomDir, { recursive: true, force: true });
  } catch (e) {}
  fs.mkdirSync(roomDir, { recursive: true });

  for (const f of files) {
    const targetPath = path.join(roomDir, f.path);
    const rel = path.relative(roomDir, targetPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue;

    if (f.isFolder) {
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }
    } else {
      const parent = path.dirname(targetPath);
      if (!fs.existsSync(parent)) {
        fs.mkdirSync(parent, { recursive: true });
      }
      fs.writeFileSync(targetPath, f.content || "", "utf8");
    }
  }
  sanitizeWorkspaceServerFiles(roomDir, roomId);
}

function ensureRoomDiskSynced(roomId: string) {
  let room = rooms.get(roomId);
  if (!room) {
    room = getOrCreateRoom(roomId);
  }
  if (!room) return;

  if (room.files.size === 0) {
    const defaultFiles = createDefaultFiles(roomId);
    for (const [id, f] of defaultFiles.entries()) {
      room.files.set(id, f);
    }
    room.activeFileId = "f_app";
  }

  const roomDir = getRoomDiskDir(roomId);
  for (const f of room.files.values()) {
    const targetPath = path.join(roomDir, f.path);
    const rel = path.relative(roomDir, targetPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
    if (f.isFolder) {
      if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      const currentContent = f.content || "";
      if (!fs.existsSync(targetPath) || fs.readFileSync(targetPath, "utf8") !== currentContent) {
        fs.writeFileSync(targetPath, currentContent, "utf8");
      }
    }
  }
  sanitizeWorkspaceServerFiles(roomDir, roomId);
}

function syncDiskFilesToRoom(roomId: string): {
  created: ServerProjectFile[];
  deleted: string[];
  updated: ServerProjectFile[];
} {
  const room = rooms.get(roomId);
  if (!room) return { created: [], deleted: [], updated: [] };
  const roomDir = getRoomDiskDir(roomId);

  const existingDiskPaths = new Set<string>();
  const newFiles: ServerProjectFile[] = [];
  const updatedFiles: ServerProjectFile[] = [];

  // Check if real node_modules directory exists on disk
  const nmDiskPath = path.join(roomDir, "node_modules");
  let hasRealNodeModules = false;
  try {
    if (fs.existsSync(nmDiskPath)) {
      const stat = fs.statSync(nmDiskPath);
      hasRealNodeModules = stat.isDirectory();
    }
  } catch (e) {}

  if (hasRealNodeModules) {
    existingDiskPaths.add("node_modules");
    const existingNm = Array.from(room.files.values()).find((f) => f.path === "node_modules");
    if (!existingNm) {
      const nmFolder: ServerProjectFile = {
        id: "dir_node_modules",
        roomId,
        name: "node_modules",
        path: "node_modules",
        content: "",
        language: "plaintext",
        isFolder: true,
        parentPath: "",
        version: 1,
        updatedAt: new Date().toISOString(),
      };
      room.files.set(nmFolder.id, nmFolder);
      newFiles.push(nmFolder);
    }
  }

  function scan(currentDir: string, relPrefix = "") {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const ent of entries) {
      if (
        ent.name === ".git" || 
        ent.name === "node_modules" || 
        ent.name === ".cache" || 
        ent.name === "_logs" ||
        ent.name === ".npm" ||
        ent.name === "_cacache" ||
        ent.name.startsWith(".")
      ) continue;
      const relPath = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
      existingDiskPaths.add(relPath);

      if (ent.isDirectory()) {
        const existing = Array.from(room.files.values()).find((f) => f.path === relPath && f.isFolder);
        if (!existing) {
          const newFolder: ServerProjectFile = {
            id: `dir_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            roomId,
            name: ent.name,
            path: relPath,
            content: "",
            language: "plaintext",
            isFolder: true,
            parentPath: relPrefix,
            version: 1,
            updatedAt: new Date().toISOString(),
          };
          room.files.set(newFolder.id, newFolder);
          newFiles.push(newFolder);
        }
        scan(path.join(currentDir, ent.name), relPath);
      } else {
        const existing = Array.from(room.files.values()).find((f) => f.path === relPath && !f.isFolder);
        let content = "";
        try {
          const stat = fs.statSync(path.join(currentDir, ent.name));
          if (stat.size < 2 * 1024 * 1024) {
            content = fs.readFileSync(path.join(currentDir, ent.name), "utf8");
          }
        } catch (e) {}

        if (!existing) {
          const newFile: ServerProjectFile = {
            id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            roomId,
            name: ent.name,
            path: relPath,
            content,
            language: getLanguageFromFilename(ent.name),
            isFolder: false,
            parentPath: relPrefix,
            version: 1,
            updatedAt: new Date().toISOString(),
          };
          room.files.set(newFile.id, newFile);
          newFiles.push(newFile);
        } else if (existing.content !== content) {
          existing.content = content;
          existing.version = (existing.version || 1) + 1;
          existing.updatedAt = new Date().toISOString();
          updatedFiles.push(existing);
        }
      }
    }
  }

  scan(roomDir);

  const deletedIds: string[] = [];
  for (const [id, f] of room.files.entries()) {
    if (f.path === "node_modules" || f.path.startsWith("node_modules/")) {
      if (!hasRealNodeModules) {
        room.files.delete(id);
        deletedIds.push(id);
      }
      continue;
    }
    if (!existingDiskPaths.has(f.path)) {
      room.files.delete(id);
      deletedIds.push(id);
    }
  }

  return { created: newFiles, deleted: deletedIds, updated: updatedFiles };
}

// Detect package manager from project lockfiles
function detectPackageManager(cwd: string): { manager: "npm" | "bun" | "yarn" | "pnpm"; installCmd: string } {
  if (fs.existsSync(path.join(cwd, "bun.lock")) || fs.existsSync(path.join(cwd, "bun.lockb"))) {
    return { manager: "bun", installCmd: "bun install" };
  }
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
    return { manager: "pnpm", installCmd: "pnpm install" };
  }
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) {
    return { manager: "yarn", installCmd: "yarn install" };
  }
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) {
    return { manager: "npm", installCmd: "npm install" };
  }
  return { manager: "npm", installCmd: "npm install" };
}

// Check if dependencies are installed and valid before running project
async function checkAndInstallDependenciesIfNeeded(
  roomId: string,
  cwd: string,
  projectInfo?: any
): Promise<{ needed: boolean; success: boolean; output: string }> {
  const pkgJsonPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    return { needed: false, success: true, output: "" };
  }

  let hasDeps = false;
  try {
    const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    const deps = { ...(pkgData.dependencies || {}), ...(pkgData.devDependencies || {}) };
    if (Object.keys(deps).length > 0) {
      hasDeps = true;
    }
  } catch (e) {
    hasDeps = true;
  }

  if (!hasDeps) {
    return { needed: false, success: true, output: "" };
  }

  const nmPath = path.join(cwd, "node_modules");
  let needsInstall = false;

  if (!fs.existsSync(nmPath)) {
    needsInstall = true;
  } else {
    try {
      const stat = fs.statSync(nmPath);
      if (!stat.isDirectory()) {
        needsInstall = true;
      } else {
        const contents = fs.readdirSync(nmPath).filter((n) => !n.startsWith("."));
        if (contents.length === 0) {
          needsInstall = true;
        }
      }
    } catch (e) {
      needsInstall = true;
    }
  }

  if (!needsInstall) {
    return { needed: false, success: true, output: "" };
  }

  const { installCmd } = detectPackageManager(cwd);
  const startMsg = `\n[CODE DEATH]: Missing dependencies detected in workspace. Executing "${installCmd}"...\n`;

  if (globalIo && roomId) {
    globalIo.to(roomId).emit("terminal-stream", {
      roomId,
      text: startMsg,
      stream: "stdout",
    });
  }

  const safeEnv = getSafeEnv(cwd);
  const installResult = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
    exec(installCmd, { cwd, env: safeEnv, timeout: 180000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      const exitCode = err ? (typeof err.code === "number" ? err.code : 1) : 0;
      resolve({ exitCode, stdout: stdout || "", stderr: stderr || "" });
    });
  });

  const combinedOutput = (installResult.stdout ? installResult.stdout + "\n" : "") + (installResult.stderr || "");
  if (globalIo && roomId) {
    globalIo.to(roomId).emit("terminal-stream", {
      roomId,
      text: combinedOutput,
      stream: installResult.exitCode === 0 ? "stdout" : "stderr",
    });
  }

  if (installResult.exitCode !== 0) {
    const errorMsg = `\n[CODE DEATH]: Package installation failed with code ${installResult.exitCode}.\n`;
    if (globalIo && roomId) {
      globalIo.to(roomId).emit("terminal-stream", {
        roomId,
        text: errorMsg,
        stream: "stderr",
      });
    }
    syncDiskFilesToRoom(roomId);
    return { needed: true, success: false, output: combinedOutput };
  }

  const completeMsg = `\n[CODE DEATH]: Dependencies successfully installed. node_modules is now ready.\n`;
  if (globalIo && roomId) {
    globalIo.to(roomId).emit("terminal-stream", {
      roomId,
      text: completeMsg,
      stream: "stdout",
    });
  }

  // Sync disk to room: node_modules will now be detected and broadcast!
  const { created, deleted, updated } = syncDiskFilesToRoom(roomId);
  if (globalIo && roomId) {
    for (const file of created) globalIo.to(roomId).emit("file-create", { file });
    for (const fileId of deleted) globalIo.to(roomId).emit("file-delete", { fileId, path: "" });
    for (const file of updated) globalIo.to(roomId).emit("file-update", { file });
  }

  return { needed: true, success: true, output: combinedOutput };
}

// ==========================================
// Process Lifecycle Manager & Classification
// ==========================================

export type ProcessType = "SHORT_COMMAND" | "LONG_RUNNING_SERVER" | "INTERACTIVE_COMMAND";
export type ProcessStatus = "STARTING" | "RUNNING" | "STOPPING" | "STOPPED" | "EXITED" | "FAILED" | "TIMED_OUT";

export interface ManagedProcess {
  process: ChildProcess;
  command: string;
  executable: string;
  args: string[];
  cwd: string;
  type: ProcessType;
  status: ProcessStatus;
  startedAt: number;
  detectedPort: number | null;
  logs: string[];
  pid: number | undefined;
  exitCode: number | null;
}

// Structured runtime state for each running project per requirements
export interface ProjectRuntimeState {
  workspaceId: string;
  projectId: string;
  processId: number | undefined;
  port: number | null;
  host: string;
  status: "STARTING" | "RUNNING" | "STOPPED" | "FAILED";
  previewUrl: string | null;
  command?: string;
  lastStarted?: number;
}

const activeProcesses = new Map<string, ManagedProcess>();
const projectRuntimeStates = new Map<string, ProjectRuntimeState>();

// Reserved container infrastructure ports that user child processes must NEVER bind to
const RESERVED_PORTS = new Set([8080, 8000, 3000, 24678, 24679]);
const roomAssignedPorts = new Map<string, number>();

// Real HTTP readiness verification before marking RUNNING
async function waitForHttpReadiness(port: number, timeoutMs = 15000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        const req = http.get(
          {
            hostname: "127.0.0.1",
            port,
            path: "/",
            timeout: 1200,
          },
          (res) => {
            // Any HTTP response indicates that the development server is listening and ready
            resolve(true);
            res.resume();
          }
        );
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
      });
      if (ok) return true;
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function getOrAllocateRoomPort(roomId?: string): Promise<number> {
  if (roomId && roomAssignedPorts.has(roomId)) {
    return roomAssignedPorts.get(roomId)!;
  }
  const net = await import("net");

  // Check candidate ports in order:
  // Try 3000 first (if free in local runtime), then 3001..3020, then 5173..5220
  const candidatePorts: number[] = [];
  for (let p = 3000; p <= 3025; p++) candidatePorts.push(p);
  for (let p = 5173; p <= 5220; p++) candidatePorts.push(p);

  for (const port of candidatePorts) {
    if (RESERVED_PORTS.has(port)) continue;
    let inUseByRoom = false;
    for (const [rId, p] of roomAssignedPorts.entries()) {
      if (p === port && rId !== roomId) {
        inUseByRoom = true;
        break;
      }
    }
    if (inUseByRoom) continue;

    const isFree = await new Promise<boolean>((resolve) => {
      const tester = net.createServer()
        .once("error", () => resolve(false))
        .once("listening", () => {
          tester.once("close", () => resolve(true)).close();
        })
        .listen(port, "0.0.0.0");
    });

    if (isFree) {
      if (roomId) roomAssignedPorts.set(roomId, port);
      return port;
    }
  }
  const fallback = 5173;
  if (roomId) roomAssignedPorts.set(roomId, fallback);
  return fallback;
}

function sanitizeWorkspaceServerFiles(cwd: string, roomId?: string, allocatedPort = 5173) {
  try {
    const candidateFiles = ["server.ts", "server.js", "app.ts", "app.js", "index.ts", "index.js", "src/server.ts", "src/index.ts"];
    for (const rel of candidateFiles) {
      const fullPath = path.join(cwd, rel);
      if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, "utf8");
        const original = content;

        // Replace hardcoded PORT = 3000 or 8080 with dynamic process.env.PORT
        content = content.replace(
          /\b(const|let|var)\s+PORT\s*=\s*(?:3000|8080)\s*;/g,
          `$1 PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : ${allocatedPort};`
        );
        content = content.replace(
          /\b(const|let|var)\s+port\s*=\s*(?:3000|8080)\s*;/g,
          `$1 port = process.env.PORT ? parseInt(process.env.PORT, 10) : ${allocatedPort};`
        );
        content = content.replace(
          /\.listen\(\s*(?:3000|8080)\s*,/g,
          `.listen(process.env.PORT ? parseInt(process.env.PORT, 10) : ${allocatedPort},`
        );
        // Avoid Vite middleware HMR port collision (24678)
        content = content.replace(
          /middlewareMode:\s*true(?!\s*,\s*hmr)/g,
          "middlewareMode: true, hmr: false"
        );

        if (content !== original) {
          fs.writeFileSync(fullPath, content, "utf8");
          if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
              const file = Array.from(room.files.values()).find((f) => f.path === rel || f.name === rel);
              if (file) {
                file.content = content;
                file.updatedAt = new Date().toISOString();
              }
            }
          }
        }
      }
    }
  } catch (e) {}
}

function getSafeEnv(cwd: string, allocatedPort = 5173) {
  const baseNodeModules = path.join(process.cwd(), "node_modules");
  const localNodeModules = path.join(cwd, "node_modules");
  const portStr = String(allocatedPort);
  return {
    ...process.env,
    PORT: portStr,
    VITE_PORT: portStr,
    SERVER_PORT: portStr,
    DISABLE_HMR: "true",
    HMR_PORT: String(allocatedPort + 1000),
    PATH: `${path.join(cwd, "node_modules", ".bin")}:${path.join(baseNodeModules, ".bin")}:${process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"}`,
    NODE_PATH: `${localNodeModules}:${baseNodeModules}`,
    HOME: cwd,
    USER: "developer",
    TERM: "xterm-256color",
    NODE_ENV: "development",
    LANG: "en_US.UTF-8",
    npm_config_cache: path.join(os.tmpdir(), ".npm-cache"),
  };
}

function extractListeningPort(output: string): number | null {
  if (!output) return null;

  const lines = output.split("\n");
  for (const line of lines) {
    const lower = line.toLowerCase();
    // Exclude error / failure / collision lines
    if (
      lower.includes("already in use") ||
      lower.includes("eaddrinuse") ||
      lower.includes("websocket server error") ||
      lower.includes("error:") ||
      lower.includes("failed to") ||
      lower.includes("fatal:") ||
      lower.includes("exception") ||
      lower.includes("denied") ||
      lower.includes("terminated")
    ) {
      continue;
    }

    // 1. Vite classic: Local: http://localhost:5173/ or Network: http://...:5173/
    const viteMatch = line.match(/(?:Local|Network):\s+https?:\/\/[a-zA-Z0-9.-]+:([0-9]{3,5})/i);
    if (viteMatch && viteMatch[1]) {
      const p = parseInt(viteMatch[1], 10);
      if (p > 1024 && p < 65536 && !RESERVED_PORTS.has(p)) return p;
    }

    // 2. Standard URL: http://localhost:PORT or http://127.0.0.1:PORT or http://0.0.0.0:PORT
    const hostMatch = line.match(/(?:https?:\/\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):([0-9]{3,5})/i);
    if (hostMatch && hostMatch[1]) {
      const p = parseInt(hostMatch[1], 10);
      if (p > 1024 && p < 65536 && !RESERVED_PORTS.has(p)) return p;
    }

    // 3. Server running at / listening on / ready on PORT
    const serverMatch = line.match(/(?:server running at|listening on|running on|ready on)\s*(?:port\s*)?:?\s*(?:https?:\/\/)?(?:[a-zA-Z0-9.-]+:)?([0-9]{3,5})/i);
    if (serverMatch && serverMatch[1]) {
      const p = parseInt(serverMatch[1], 10);
      if (p > 1024 && p < 65536 && !RESERVED_PORTS.has(p)) return p;
    }
  }

  return null;
}

// Classify whether command should be treated as long-running server or short command
function classifyProcessType(cmdStr: string, projectInfo?: any): ProcessType {
  const trimmed = cmdStr.trim();
  if (
    /\b(npm|bun|pnpm|yarn)\s+(run\s+)?(dev|start|serve|watch)\b/i.test(trimmed) ||
    /\b(npx\s+|bunx\s+)?vite(\s+.*)?$/i.test(trimmed) ||
    /\bnext\s+(dev|start)\b/i.test(trimmed) ||
    /\b(python|python3)\s+(-m\s+)?(http\.server|uvicorn|flask|django|gunicorn)\b/i.test(trimmed) ||
    /\bnode\s+.*(server|app|index|main)\.js\b/i.test(trimmed) ||
    /\bnodemon\b/i.test(trimmed) ||
    /\blive-server\b/i.test(trimmed) ||
    /\bwebpack\s+serve\b/i.test(trimmed)
  ) {
    return "LONG_RUNNING_SERVER";
  }

  if (projectInfo) {
    if (projectInfo.hasDevScript || projectInfo.projectType === "react-vite" || projectInfo.projectType === "next") {
      if (trimmed === "run" || trimmed === projectInfo.primaryRunCommand) {
        return "LONG_RUNNING_SERVER";
      }
    }
  }

  return "SHORT_COMMAND";
}

// Parse command and strip accidental prompt prefixes or workspace display names
function parseAndSanitizeCommand(
  rawCommand: string,
  options: {
    roomname?: string;
    projectName?: string;
    roomId?: string;
  } = {}
): { executable: string; args: string[]; cleanCommand: string; isDisplayNameOnly: boolean } {
  let cleaned = rawCommand.trim();

  // Strip prompt string if user copied from terminal output
  // e.g. "developer@code-death:~/workspace/...$ bun run dev" or "$ bun run dev"
  cleaned = cleaned.replace(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:[^$#]*[$#]\s*/, "");
  cleaned = cleaned.replace(/^[$#]\s+/, "");

  // Candidate display names to protect against executing as shell commands
  const namesToCheck = [
    options.roomname,
    options.projectName,
    "collaborative workspace",
    "collaborative",
    "live collaborative workspace",
    "code death workspace",
    "workspace",
  ].filter(Boolean) as string[];

  // 1. Is the command EXACTLY a display name?
  for (const name of namesToCheck) {
    if (cleaned.toLowerCase() === name.toLowerCase().trim()) {
      return {
        executable: "",
        args: [],
        cleanCommand: "",
        isDisplayNameOnly: true,
      };
    }
  }

  // 2. Does the command start with a display name prefix?
  // e.g. "collaborative bun run dev" or "Collaborative Workspace: bun run dev"
  for (const name of namesToCheck) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escaped}[:\\s]+`, "i");
    if (regex.test(cleaned)) {
      const rest = cleaned.replace(regex, "").trim();
      if (rest) {
        cleaned = rest;
        break;
      }
    }
  }

  // Tokenize taking quotes into account
  const tokens: string[] = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match;
  while ((match = regex.exec(cleaned)) !== null) {
    tokens.push(match[1] !== undefined ? match[1] : (match[2] !== undefined ? match[2] : match[0]));
  }

  let executable = tokens[0] || "";
  if (executable === "python") executable = "python3";
  const args = tokens.slice(1);

  return {
    executable,
    args,
    cleanCommand: cleaned,
    isDisplayNameOnly: false,
  };
}

// Stop and kill an active managed process tree
async function stopManagedProcess(roomId: string): Promise<boolean> {
  const managed = activeProcesses.get(roomId);
  if (!managed) return false;

  managed.status = "STOPPING";
  const pid = managed.pid;

  if (pid) {
    try {
      // Send SIGTERM to process group
      process.kill(-pid, "SIGTERM");
    } catch (e) {
      try {
        managed.process.kill("SIGTERM");
      } catch (e2) {}
    }

    try {
      execSync(`pkill -TERM -P ${pid} 2>/dev/null || true`);
    } catch (e) {}

    // Grace period then force SIGKILL if still running
    await new Promise((r) => setTimeout(r, 400));
    try {
      execSync(`pkill -KILL -P ${pid} 2>/dev/null || true`);
      process.kill(-pid, "SIGKILL");
    } catch (e) {
      try {
        managed.process.kill("SIGKILL");
      } catch (e2) {}
    }
  }

  managed.status = "STOPPED";
  activeProcesses.delete(roomId);

  if (roomId) {
    projectRuntimeStates.set(roomId, {
      workspaceId: roomId,
      projectId: "workspace",
      processId: undefined,
      port: null,
      host: "0.0.0.0",
      status: "STOPPED",
      previewUrl: null,
      command: managed.command,
    });
  }

  if (globalIo && roomId) {
    globalIo.to(roomId).emit("terminal-status", {
      isRunning: false,
      status: "STOPPED",
      command: managed.command,
      port: null,
      previewUrl: null,
    });
    globalIo.to(roomId).emit("terminal-stream", {
      roomId,
      text: `\n[Process terminated: ${managed.command}]\n`,
      stream: "stderr",
    });
  }

  return true;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  detectedPort?: number | null;
  status: ProcessStatus;
  isRunning: boolean;
  pid?: number;
  command?: string;
}

// Execute command with real process lifecycle management
async function executeCommandWithLifecycle(options: {
  command: string;
  cwd: string;
  roomId?: string;
  projectInfo?: any;
  restartIfRunning?: boolean;
}): Promise<ExecutionResult> {
  const { command, cwd, roomId, projectInfo, restartIfRunning } = options;
  const room = roomId ? rooms.get(roomId) : null;

  // Sanitize and check for display name leakage
  const parsed = parseAndSanitizeCommand(command, {
    roomname: room?.roomname,
    projectName: room?.roomname,
    roomId,
  });

  if (parsed.isDisplayNameOnly) {
    const effectiveProject = projectInfo || (room ? detectProject(Array.from(room.files.values())) : null);
    if (effectiveProject && effectiveProject.primaryRunCommand && effectiveProject.primaryRunCommand !== "help") {
      return executeCommandWithLifecycle({
        ...options,
        command: effectiveProject.primaryRunCommand,
      });
    }
    return {
      stdout: `[CODE DEATH]: "${command}" is the workspace display name. Use 'run' to start development or choose a project script.`,
      stderr: "",
      exitCode: 0,
      status: "EXITED",
      isRunning: false,
    };
  }

  let finalCmd = parsed.cleanCommand;
  if (!finalCmd) {
    return { stdout: "", stderr: "", exitCode: 0, status: "EXITED", isRunning: false };
  }

  if (finalCmd.trim() === "python" || finalCmd.startsWith("python ")) {
    finalCmd = finalCmd.replace(/^python(\s+|$)/, "python3$1");
  }

  // Classify process type
  const procType = classifyProcessType(finalCmd, projectInfo);

  // If a server is already running in this room
  if (roomId && activeProcesses.has(roomId)) {
    const existing = activeProcesses.get(roomId)!;
    if (existing.status === "RUNNING") {
      if (restartIfRunning) {
        await stopManagedProcess(roomId);
        await new Promise((r) => setTimeout(r, 600));
      } else if (procType === "LONG_RUNNING_SERVER") {
        return {
          stdout: `[CODE DEATH]: Development server is already running (${existing.command})\nLocal: http://localhost:${existing.detectedPort || 5173}/\nStatus: RUNNING (PID: ${existing.pid})`,
          stderr: "",
          exitCode: null,
          detectedPort: existing.detectedPort,
          status: "RUNNING",
          isRunning: true,
          pid: existing.pid,
          command: existing.command,
        };
      }
    }
  }

  // Allocate an available port for this room's development server
  const allocatedPort = await getOrAllocateRoomPort(roomId);

  // Automatically patch any hardcoded port 3000 / 8080 in workspace server files
  sanitizeWorkspaceServerFiles(cwd, roomId, allocatedPort);

  const safeEnv = getSafeEnv(cwd, allocatedPort);

  // 1. SHORT_COMMAND (ls, pwd, cat, npm install, npm run build, etc.)
  if (procType === "SHORT_COMMAND") {
    return new Promise<ExecutionResult>((resolve) => {
      const isInstallOrBuild = /\b(install|i|add|build)\b/i.test(finalCmd);
      const timeoutMs = isInstallOrBuild ? 180000 : 35000;

      try {
        exec(finalCmd, { cwd, env: safeEnv, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
          const rawStdout = stdout ? stdout.trim() : "";
          let rawStderr = stderr ? stderr.trim() : "";
          if (err && (err as any).killed) {
            rawStderr = `Command timed out after ${timeoutMs / 1000}s`;
            return resolve({
              stdout: rawStdout,
              stderr: rawStderr,
              exitCode: 124,
              status: "TIMED_OUT",
              isRunning: false,
              command: finalCmd,
            });
          }
          const exitCode = err ? (typeof err.code === "number" ? err.code : 1) : 0;
          resolve({
            stdout: rawStdout,
            stderr: rawStderr,
            exitCode,
            status: exitCode === 0 ? "EXITED" : "FAILED",
            isRunning: false,
            command: finalCmd,
          });
        });
      } catch (e: any) {
        resolve({
          stdout: "",
          stderr: e.message || "Failed to execute command",
          exitCode: 1,
          status: "FAILED",
          isRunning: false,
          command: finalCmd,
        });
      }
    });
  }

  // 2. LONG_RUNNING_SERVER (bun run dev, npm run dev, vite, python3 -m http.server, etc.)
  // Before starting project dev server, check if dependencies must be installed
  if (roomId) {
    const depCheck = await checkAndInstallDependenciesIfNeeded(roomId, cwd, projectInfo);
    if (depCheck.needed && !depCheck.success) {
      return {
        stdout: depCheck.output,
        stderr: "[CODE DEATH]: Development server startup aborted because dependency installation failed.",
        exitCode: 1,
        status: "FAILED",
        isRunning: false,
        command: finalCmd,
      };
    }
  }

  return new Promise<ExecutionResult>((resolve) => {
    let resolved = false;
    let initialStdout = "";
    let initialStderr = "";
    let detectedPort: number | null = null;

    // Spawn long-running server process safely
    const child = spawn(finalCmd, [], {
      cwd,
      env: safeEnv,
      shell: true,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const managed: ManagedProcess = {
      process: child,
      command: finalCmd,
      executable: parsed.executable,
      args: parsed.args,
      cwd,
      type: "LONG_RUNNING_SERVER",
      status: "STARTING",
      startedAt: Date.now(),
      detectedPort: null,
      logs: [],
      pid: child.pid,
      exitCode: null,
    };

    if (roomId) {
      activeProcesses.set(roomId, managed);
      projectRuntimeStates.set(roomId, {
        workspaceId: roomId,
        projectId: room?.roomname || "workspace",
        processId: child.pid,
        port: null,
        host: "0.0.0.0",
        status: "STARTING",
        previewUrl: null,
        command: finalCmd,
        lastStarted: Date.now(),
      });
    }

    let isVerifyingReadiness = false;

    const checkOutput = (chunkStr: string, isErr = false) => {
      managed.logs.push(chunkStr);
      if (managed.logs.length > 2000) managed.logs.shift();

      if (!isErr) {
        initialStdout += chunkStr;
      } else {
        initialStderr += chunkStr;
      }

      // Stream to Socket.IO clients in room
      if (roomId && globalIo) {
        globalIo.to(roomId).emit("terminal-stream", {
          roomId,
          text: chunkStr,
          stream: isErr ? "stderr" : "stdout",
          port: managed.detectedPort,
        });
      }

      // Detect listening port
      const foundPort = extractListeningPort(initialStdout + "\n" + initialStderr);
      if (foundPort) {
        detectedPort = foundPort;
        managed.detectedPort = foundPort;
      }

      // Detect ready signal (e.g. Vite ready, Local: http://localhost:5173/)
      const combined = (initialStdout + "\n" + initialStderr).toLowerCase();
      const isReadyPattern =
        detectedPort !== null ||
        combined.includes("ready in") ||
        combined.includes("local:   http") ||
        combined.includes("network: http") ||
        combined.includes("server running at") ||
        combined.includes("listening on");

      if ((isReadyPattern || detectedPort !== null) && !isVerifyingReadiness && !resolved) {
        isVerifyingReadiness = true;
        const targetPort = detectedPort || allocatedPort;

        // Verify with REAL HTTP request before marking RUNNING
        waitForHttpReadiness(targetPort, 12000).then((isHealthy) => {
          if (isHealthy && !resolved) {
            resolved = true;
            managed.status = "RUNNING";
            managed.detectedPort = targetPort;

            if (roomId) {
              projectRuntimeStates.set(roomId, {
                workspaceId: roomId,
                projectId: room?.roomname || "workspace",
                processId: child.pid,
                port: targetPort,
                host: "0.0.0.0",
                status: "RUNNING",
                previewUrl: `/api/preview/${targetPort}/`,
                command: finalCmd,
                lastStarted: Date.now(),
              });
            }

            if (roomId && globalIo) {
              globalIo.to(roomId).emit("terminal-status", {
                isRunning: true,
                status: "RUNNING",
                port: targetPort,
                previewUrl: `/api/preview/${targetPort}/`,
                command: managed.command,
                workspaceId: roomId,
              });
            }

            resolve({
              stdout: initialStdout.trim(),
              stderr: initialStderr.trim(),
              exitCode: null,
              detectedPort: targetPort,
              status: "RUNNING",
              isRunning: true,
              pid: child.pid,
              command: managed.command,
            });
          }
        });
      }
    };

    if (child.stdout) {
      child.stdout.on("data", (d) => checkOutput(d.toString(), false));
    }
    if (child.stderr) {
      child.stderr.on("data", (d) => checkOutput(d.toString(), true));
    }

    child.on("error", (err) => {
      managed.status = "FAILED";
      managed.detectedPort = null;
      if (roomId) {
        activeProcesses.delete(roomId);
        projectRuntimeStates.set(roomId, {
          workspaceId: roomId,
          projectId: room?.roomname || "workspace",
          processId: undefined,
          port: null,
          host: "0.0.0.0",
          status: "FAILED",
          previewUrl: null,
          command: managed.command,
        });
      }
      if (!resolved) {
        resolved = true;
        resolve({
          stdout: initialStdout.trim(),
          stderr: `Failed to start: ${err.message}`,
          exitCode: 1,
          status: "FAILED",
          isRunning: false,
          command: managed.command,
        });
      }
    });

    child.on("exit", (code) => {
      managed.status = code === 0 ? "EXITED" : "FAILED";
      managed.exitCode = code;
      managed.detectedPort = null;
      if (roomId) {
        activeProcesses.delete(roomId);
        projectRuntimeStates.set(roomId, {
          workspaceId: roomId,
          projectId: room?.roomname || "workspace",
          processId: undefined,
          port: null,
          host: "0.0.0.0",
          status: "STOPPED",
          previewUrl: null,
          command: managed.command,
        });
      }
      if (roomId && globalIo) {
        globalIo.to(roomId).emit("terminal-status", {
          isRunning: false,
          status: managed.status,
          port: null,
          previewUrl: null,
          command: managed.command,
          exitCode: code,
        });
      }
      if (!resolved) {
        resolved = true;
        resolve({
          stdout: initialStdout.trim(),
          stderr: initialStderr.trim(),
          exitCode: code !== null ? code : 1,
          status: managed.status,
          isRunning: false,
          command: managed.command,
        });
      }
    });

    // Fallback response timeout so client receives initial stdout/stderr even if server takes time to boot
    setTimeout(async () => {
      if (!resolved) {
        const targetPort = managed.detectedPort || allocatedPort;
        const healthy = await waitForHttpReadiness(targetPort, 2000);
        if (healthy && !resolved) {
          resolved = true;
          managed.status = "RUNNING";
          managed.detectedPort = targetPort;
          if (roomId) {
            projectRuntimeStates.set(roomId, {
              workspaceId: roomId,
              projectId: room?.roomname || "workspace",
              processId: child.pid,
              port: targetPort,
              host: "0.0.0.0",
              status: "RUNNING",
              previewUrl: `/api/preview/${targetPort}/`,
              command: finalCmd,
              lastStarted: Date.now(),
            });
          }
          if (roomId && globalIo) {
            globalIo.to(roomId).emit("terminal-status", {
              isRunning: true,
              status: "RUNNING",
              port: targetPort,
              previewUrl: `/api/preview/${targetPort}/`,
              command: managed.command,
              workspaceId: roomId,
            });
          }
          resolve({
            stdout: initialStdout.trim(),
            stderr: initialStderr.trim(),
            exitCode: null,
            detectedPort: targetPort,
            status: "RUNNING",
            isRunning: true,
            pid: child.pid,
            command: managed.command,
          });
        }
      }
    }, 4000);
  });
}

// Backwards-compatible helper wrapping executeCommandWithLifecycle
function executeShellCommand(cmd: string, cwd: string, roomId?: string, timeoutMs = 45000): Promise<{ stdout: string; stderr: string; exitCode: number; detectedPort?: number | null; isRunning?: boolean; status?: ProcessStatus }> {
  return executeCommandWithLifecycle({
    command: cmd,
    cwd,
    roomId,
  }).then((res) => ({
    stdout: res.stdout,
    stderr: res.stderr,
    exitCode: res.exitCode ?? 0,
    detectedPort: res.detectedPort,
    isRunning: res.isRunning,
    status: res.status,
  }));
}

// Execution sandboxes for Python and Node
function executePythonCode(code: string, timeoutMs = 15000, cwd?: string, filePath?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const runDir = cwd || os.tmpdir();
    const targetFile = filePath ? path.join(runDir, filePath) : path.join(runDir, `cd_py_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.py`);
    const isTemp = !filePath;

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFile(targetFile, code, "utf8", (wErr) => {
      if (wErr) {
        return resolve({ stdout: "", stderr: "Failed to create execution file: " + wErr.message, exitCode: 1 });
      }
      execFile("python3", [targetFile], { timeout: timeoutMs, maxBuffer: 1024 * 1024, cwd: runDir, env: getSafeEnv(runDir) }, (err, stdout, stderr) => {
        if (isTemp) {
          fs.unlink(targetFile, () => {});
        }
        if (err && (err as any).killed) {
          return resolve({ stdout: stdout ? stdout.trim() : "", stderr: `Process timed out after ${timeoutMs}ms`, exitCode: 124 });
        }
        resolve({
          stdout: stdout ? stdout.trim() : "",
          stderr: stderr ? stderr.trim() : (err ? err.message : ""),
          exitCode: err ? (typeof err.code === "number" ? err.code : 1) : 0,
        });
      });
    });
  });
}

function executeNodeCode(code: string, timeoutMs = 15000, cwd?: string, filePath?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const runDir = cwd || os.tmpdir();
    const targetFile = filePath ? path.join(runDir, filePath) : path.join(runDir, `cd_js_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.js`);
    const isTemp = !filePath;

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFile(targetFile, code, "utf8", (wErr) => {
      if (wErr) {
        return resolve({ stdout: "", stderr: "Failed to create execution file: " + wErr.message, exitCode: 1 });
      }
      execFile("node", [targetFile], { timeout: timeoutMs, maxBuffer: 1024 * 1024, cwd: runDir, env: getSafeEnv(runDir) }, (err, stdout, stderr) => {
        if (isTemp) {
          fs.unlink(targetFile, () => {});
        }
        if (err && (err as any).killed) {
          return resolve({ stdout: stdout ? stdout.trim() : "", stderr: `Process timed out after ${timeoutMs}ms`, exitCode: 124 });
        }
        resolve({
          stdout: stdout ? stdout.trim() : "",
          stderr: stderr ? stderr.trim() : (err ? err.message : ""),
          exitCode: err ? (typeof err.code === "number" ? err.code : 1) : 0,
        });
      });
    });
  });
}

// Lazy initialize Gemini API client
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

export interface ServerProjectFile {
  id: string;
  roomId: string;
  name: string;
  path: string;
  content: string;
  language: string;
  isFolder: boolean;
  parentPath: string;
  version: number;
  updatedAt: string;
}

interface StoredUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

interface StoredRoom {
  roomId: string;
  roomname: string;
  owner: string;
  lastUpdated: string;
  activeFileId: string;
  isReadOnly?: boolean;
  passcode?: string;
  files: Map<string, ServerProjectFile>;
  participants: Map<string, { username: string; userColor: string; isHost: boolean; activeFileId?: string; userId?: string }>;
}

const users = new Map<string, StoredUser>(); // email -> user
const rooms = new Map<string, StoredRoom>(); // roomId -> room
const socketUserMap = new Map<string, { username: string; userColor: string; roomId?: string; activeFileId?: string }>();

export interface CallParticipant {
  socketId: string;
  username: string;
  userColor?: string;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isScreenSharing: boolean;
}
const callRooms = new Map<string, Map<string, CallParticipant>>(); // roomId -> (socketId -> participant)
const closedRooms = new Set<string>(); // Closed/deleted room IDs

function checkRoomStatus(roomId: string): { exists: boolean; isClosed?: boolean; roomname?: string; isReadOnly?: boolean; hasPasscode?: boolean } {
  if (!roomId) return { exists: false };
  if (closedRooms.has(roomId)) {
    return { exists: false, isClosed: true };
  }
  const memRoom = rooms.get(roomId);
  if (memRoom) {
    return {
      exists: true,
      roomname: memRoom.roomname,
      isReadOnly: memRoom.isReadOnly,
      hasPasscode: !!memRoom.passcode,
    };
  }
  const diskDir = getRoomDiskDir(roomId);
  if (fs.existsSync(diskDir)) {
    const fromDisk = loadWorkspaceFilesFromDisk(roomId);
    if (fromDisk.files.size > 0) {
      return {
        exists: true,
        roomname: fromDisk.projectName || "Collaborative Workspace",
      };
    }
  }
  return { exists: false };
}

function getFirebaseServerConfig() {
  let apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";
  let projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";

  if (!apiKey || !projectId) {
    try {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
        apiKey = apiKey || raw.apiKey;
        projectId = projectId || raw.projectId;
      }
    } catch {}
  }
  return { apiKey, projectId };
}

async function loadRoomFromFirestoreOnServer(roomId: string, idToken?: string): Promise<{
  exists: boolean;
  status: string;
  name: string;
  ownerId: string;
  files?: ServerProjectFile[];
} | null> {
  const { projectId } = getFirebaseServerConfig();
  if (!projectId || !roomId) return null;

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/rooms/${encodeURIComponent(roomId)}`;
    const headers: Record<string, string> = {};
    if (idToken) {
      headers["Authorization"] = `Bearer ${idToken}`;
    }

    const res = await fetch(url, { headers });
    if (res.status === 404) {
      return { exists: false, status: "not_found", name: "", ownerId: "" };
    }
    if (res.status === 200) {
      const doc = await res.json() as any;
      const fields = doc.fields || {};
      const status = fields.status?.stringValue || "active";
      const name = fields.name?.stringValue || "CODE DEATH Workspace";
      const ownerId = fields.ownerId?.stringValue || fields.hostId?.stringValue || fields.createdBy?.stringValue || "";

      let fetchedFiles: ServerProjectFile[] = [];
      try {
        const filesUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/rooms/${encodeURIComponent(roomId)}/files`;
        const filesRes = await fetch(filesUrl, { headers });
        if (filesRes.status === 200) {
          const filesData = await filesRes.json() as any;
          if (filesData.documents && Array.isArray(filesData.documents)) {
            for (const d of filesData.documents) {
              const ff = d.fields || {};
              const id = ff.id?.stringValue || path.basename(d.name);
              fetchedFiles.push({
                id,
                roomId,
                name: ff.name?.stringValue || id,
                path: ff.path?.stringValue || id,
                content: ff.content?.stringValue || "",
                language: ff.language?.stringValue || "plaintext",
                isFolder: ff.isFolder?.booleanValue || false,
                parentPath: ff.parentPath?.stringValue || "",
                version: ff.version?.integerValue ? Number(ff.version.integerValue) : 1,
                updatedAt: ff.updatedAt?.stringValue || new Date().toISOString(),
              });
            }
          }
        }
      } catch (err) {
        console.warn("Could not fetch files subcollection from Firestore:", err);
      }

      return {
        exists: true,
        status,
        name,
        ownerId,
        files: fetchedFiles.length > 0 ? fetchedFiles : undefined,
      };
    }
  } catch (err) {
    console.warn("loadRoomFromFirestoreOnServer error:", err);
  }
  return null;
}

const USER_COLORS = [
  "#38bdf8", "#4ade80", "#f43f5e", "#fbbf24", 
  "#a855f7", "#ec4899", "#14b8a6", "#f97316"
];

function getRandomColor(): string {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

function createDefaultFiles(roomId: string): Map<string, ServerProjectFile> {
  const map = new Map<string, ServerProjectFile>();
  const now = new Date().toISOString();

  // Folders
  map.set("f_src", {
    id: "f_src",
    roomId,
    name: "src",
    path: "src",
    content: "",
    language: "javascript",
    isFolder: true,
    parentPath: "",
    version: 1,
    updatedAt: now,
  });

  // App.jsx
  map.set("f_app", {
    id: "f_app",
    roomId,
    name: "App.jsx",
    path: "src/App.jsx",
    language: "javascript",
    isFolder: false,
    parentPath: "src",
    version: 1,
    updatedAt: now,
    content: `// CODE DEATH Collaborative Web IDE
// Test File: Supports full vertical and horizontal scrolling across 100+ lines
import React, { useState, useEffect, useCallback } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  const [history, setHistory] = useState([]);
  const [activeSession, setActiveSession] = useState('CODE_DEATH_ALPHA');
  const [collaborators, setCollaborators] = useState([
    { id: 1, name: 'Lead Architect', role: 'Host', status: 'online' },
    { id: 2, name: 'Pair Partner', role: 'Editor', status: 'coding' },
    { id: 3, name: 'Reviewer', role: 'Viewer', status: 'idle' },
  ]);

  // Log counter events into historical timeline
  const recordEvent = useCallback((action, val) => {
    const timestamp = new Date().toLocaleTimeString();
    setHistory((prev) => [
      { id: Date.now(), action, val, time: timestamp },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const handleIncrement = () => {
    setCount((prev) => {
      const next = prev + 1;
      recordEvent('INCREMENT', next);
      return next;
    });
  };

  const handleDecrement = () => {
    setCount((prev) => {
      const next = prev - 1;
      recordEvent('DECREMENT', next);
      return next;
    });
  };

  const handleReset = () => {
    setCount(0);
    recordEvent('RESET', 0);
  };

  useEffect(() => {
    console.log('[CODE DEATH]: Initialized collaborative workspace:', activeSession);
  }, [activeSession]);

  return (
    <div className="container min-h-screen bg-slate-950 text-slate-100 p-8">
      {/* Header Section */}
      <header className="border-b border-slate-800 pb-6 mb-8">
        <h1 className="text-3xl font-extrabold text-cyan-400 tracking-tight">
          ⚡ CODE DEATH Collaborative IDE
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Next-Generation Realtime Developer Pair Programming Sandbox
        </p>
      </header>

      {/* Main Grid View */}
      <main className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Interactive State Card */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-bold text-slate-200 mb-2">Interactive Counter</h2>
          <p className="text-slate-400 text-xs mb-4">
            State changes sync across all connected developers in real time.
          </p>

          <div className="flex items-center justify-center my-8">
            <span className="text-6xl font-black text-cyan-300 font-mono">
              {count}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleIncrement}
              className="flex-1 py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 font-bold rounded-lg transition-colors"
            >
              + Increment
            </button>
            <button
              onClick={handleDecrement}
              className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 font-bold rounded-lg transition-colors"
            >
              - Decrement
            </button>
            <button
              onClick={handleReset}
              className="py-2.5 px-4 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold rounded-lg transition-colors"
            >
              Reset
            </button>
          </div>
        </section>

        {/* Collaborators Active Panel */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-bold text-slate-200 mb-2">Connected Team</h2>
          <p className="text-slate-400 text-xs mb-4">
            Realtime presence and collaborative session roster.
          </p>

          <ul className="space-y-3">
            {collaborators.map((user) => (
              <li
                key={user.id}
                className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold text-slate-200">{user.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-cyan-400 font-mono">
                    {user.role}
                  </span>
                  <span className="text-xs text-slate-500">{user.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      {/* Activity Timeline / History Feed */}
      <footer className="mt-12 bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-bold text-slate-300 mb-4">Session Event Log</h3>
        {history.length === 0 ? (
          <p className="text-slate-500 text-sm">No actions recorded yet. Click the buttons above!</p>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-xs py-1.5 px-3 bg-slate-950/40 rounded border border-slate-800/40 font-mono"
              >
                <span className="text-cyan-400">{item.action}</span>
                <span className="text-slate-300">Value: {item.val}</span>
                <span className="text-slate-500">{item.time}</span>
              </div>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
// End of file: Verified line 140+ for unlimited editor scroll tests
`,
  });

  // index.css
  map.set("f_css", {
    id: "f_css",
    roomId,
    name: "index.css",
    path: "src/index.css",
    language: "css",
    isFolder: false,
    parentPath: "src",
    version: 1,
    updatedAt: now,
    content: `/* Collaborative Styling */
:root {
  --primary: #38bdf8;
  --bg: #0f172a;
  --surface: #1e293b;
  --text: #f8fafc;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background-color: var(--bg);
  color: var(--text);
  display: flex;
  justify-content: center;
  padding: 2rem;
}

.container {
  max-width: 600px;
  width: 100%;
}

.card {
  background: var(--surface);
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid #334155;
  margin: 1.5rem 0;
}

.count-display {
  font-size: 2.5rem;
  font-weight: 800;
  color: var(--primary);
  margin: 0.5rem 0;
}

button {
  background: var(--primary);
  color: #0f172a;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  margin-right: 8px;
}

button.secondary {
  background: #334155;
  color: #f8fafc;
}`,
  });

  // index.html
  map.set("f_html", {
    id: "f_html",
    roomId,
    name: "index.html",
    path: "index.html",
    language: "html",
    isFolder: false,
    parentPath: "",
    version: 1,
    updatedAt: now,
    content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Live Collaborative Workspace</title>
    <link rel="stylesheet" href="src/index.css" />
  </head>
  <body>
    <div id="root">
      <h1>🚀 Pair Programming Playground</h1>
      <p>Edit HTML, CSS, or JS files to see instant synchronized live preview!</p>
    </div>
  </body>
</html>`,
  });

  // main.py
  map.set("f_py", {
    id: "f_py",
    roomId,
    name: "main.py",
    path: "main.py",
    language: "python",
    isFolder: false,
    parentPath: "",
    version: 1,
    updatedAt: now,
    content: `# Collaborative Python Script
def fibonacci(n):
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result

print("Fibonacci Sequence (first 10 numbers):")
print(fibonacci(10))

print("\\nTeam Pair Collaboration: Ready!")`,
  });

  // package.json
  map.set("f_pkg", {
    id: "f_pkg",
    roomId,
    name: "package.json",
    path: "package.json",
    language: "json",
    isFolder: false,
    parentPath: "",
    version: 1,
    updatedAt: now,
    content: `{
  "name": "collab-workspace",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "echo \\"All tests passed in real-time sandbox\\""
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.2.0"
  }
}`,
  });

  // vite.config.js
  map.set("f_vite_config", {
    id: "f_vite_config",
    roomId,
    name: "vite.config.js",
    path: "vite.config.js",
    language: "javascript",
    isFolder: false,
    parentPath: "",
    version: 1,
    updatedAt: now,
    content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
});
`,
  });

  // README.md
  map.set("f_readme", {
    id: "f_readme",
    roomId,
    name: "README.md",
    path: "README.md",
    language: "markdown",
    isFolder: false,
    parentPath: "",
    version: 1,
    updatedAt: now,
    content: `# Real-Time Collaborative Web IDE

Welcome to your live multi-user pair programming workspace!

## Key Features
- **Delta-Based Synchronization**: Non-overwriting concurrent editing.
- **VS Code Web IDE Layout**: File Explorer, Tabs, Breadcrumbs, Status Bar.
- **Integrated Terminal**: Execute \`run\`, \`node\`, \`python\`, \`ls\`, \`cat\`, \`help\`.
- **Live Peer Audio & Video**: WebRTC grid with device permissions and mic controls.
- **JARVIS AI Assistant**: Code analysis powered by Gemini API.
- **Firebase Auth & Firestore**: Durable persistent cloud storage.
`,
  });

  return map;
}

function loadWorkspaceFilesFromDisk(roomId: string): { files: Map<string, ServerProjectFile>; projectName?: string; activeFileId?: string } {
  const diskDir = getRoomDiskDir(roomId);
  const filesMap = new Map<string, ServerProjectFile>();
  let projectName: string | undefined;
  let activeFileId: string | undefined;

  if (!fs.existsSync(diskDir)) return { files: filesMap };

  const metaPath = path.join(diskDir, "metadata.json");
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (meta.name) projectName = meta.name;
    } catch (e) {}
  }

  const pkgPath = path.join(diskDir, "package.json");
  if (!projectName && fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.name) projectName = pkg.name;
    } catch (e) {}
  }

  function walk(dir: string, base: string) {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const ent of entries) {
      if (
        ent.name === "node_modules" ||
        ent.name === ".git" ||
        ent.name === "dist" ||
        ent.name === ".next" ||
        ent.name.startsWith(".cache")
      ) {
        continue;
      }
      const fullPath = path.join(dir, ent.name);
      const relPath = base ? path.join(base, ent.name) : ent.name;
      const id = "f_" + Buffer.from(relPath).toString("base64").replace(/[^a-zA-Z0-9]/g, "_");

      if (ent.isDirectory()) {
        filesMap.set(id, {
          id,
          roomId,
          name: ent.name,
          path: relPath,
          content: "",
          language: "folder",
          isFolder: true,
          parentPath: base,
          version: 1,
          updatedAt: new Date().toISOString(),
        });
        walk(fullPath, relPath);
      } else {
        try {
          const content = fs.readFileSync(fullPath, "utf8");
          const ext = path.extname(ent.name).toLowerCase();
          const langMap: Record<string, string> = {
            ".js": "javascript",
            ".jsx": "javascript",
            ".ts": "typescript",
            ".tsx": "typescript",
            ".json": "json",
            ".html": "html",
            ".css": "css",
            ".py": "python",
            ".md": "markdown",
          };
          filesMap.set(id, {
            id,
            roomId,
            name: ent.name,
            path: relPath,
            content,
            isFolder: false,
            parentPath: base,
            language: langMap[ext] || "plaintext",
            version: 1,
            updatedAt: new Date().toISOString(),
          });
          if (!activeFileId && (relPath === "src/App.tsx" || relPath === "src/main.tsx" || relPath === "server.ts" || relPath === "index.html")) {
            activeFileId = id;
          }
        } catch (e) {}
      }
    }
  }

  walk(diskDir, "");
  return { files: filesMap, projectName, activeFileId };
}

function getOrCreateRoom(roomId: string, roomname = "Collaborative Workspace", isDemo = false): StoredRoom {
  let room = rooms.get(roomId);
  if (!room) {
    const fromDisk = loadWorkspaceFilesFromDisk(roomId);
    if (fromDisk.files.size > 0) {
      room = {
        roomId,
        roomname: fromDisk.projectName || roomname,
        owner: "collaborator",
        lastUpdated: new Date().toISOString(),
        activeFileId: fromDisk.activeFileId || Array.from(fromDisk.files.keys())[0],
        files: fromDisk.files,
        participants: new Map(),
      };
      rooms.set(roomId, room);
      sanitizeWorkspaceServerFiles(getRoomDiskDir(roomId), roomId);
    } else {
      const files = createDefaultFiles(roomId);
      const initialActive = "f_app";
      room = {
        roomId,
        roomname,
        owner: "collaborator",
        lastUpdated: new Date().toISOString(),
        activeFileId: initialActive,
        files,
        participants: new Map(),
      };
      rooms.set(roomId, room);
      replaceWorkspaceOnDisk(roomId, Array.from(files.values()));
    }
  } else if (room.files.size === 0) {
    const fromDisk = loadWorkspaceFilesFromDisk(roomId);
    if (fromDisk.files.size > 0) {
      room.files = fromDisk.files;
      room.activeFileId = fromDisk.activeFileId || Array.from(fromDisk.files.keys())[0];
      if (fromDisk.projectName) room.roomname = fromDisk.projectName;
    } else {
      const defaultFiles = createDefaultFiles(roomId);
      for (const [id, f] of defaultFiles.entries()) {
        room.files.set(id, f);
      }
      room.activeFileId = "f_app";
      replaceWorkspaceOnDisk(roomId, Array.from(room.files.values()));
    }
  }
  return room;
}

// Pre-populate default room
getOrCreateRoom("demo-workspace", "Live Collaborative Workspace", true);

let globalIo: Server | null = null;

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Socket.IO Setup
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: 5e7, // 50MB
  });
  globalIo = io;

  io.on("connection", (socket) => {
    // Join room
    socket.on("join", async ({ roomId, username, userColor, userId, idToken }) => {
      if (!roomId) return;
      if (closedRooms.has(roomId)) {
        socket.emit("room-error", { 
          code: "ROOM_CLOSED",
          message: "This room is no longer available." 
        });
        return;
      }
      const cleanUsername = username?.trim() || "Collaborator";
      const color = userColor || getRandomColor();

      // Check persistent room metadata from Firestore
      const firestoreData = await loadRoomFromFirestoreOnServer(roomId, idToken);
      if (firestoreData) {
        if (!firestoreData.exists) {
          socket.emit("room-error", {
            code: "ROOM_NOT_FOUND",
            message: "Room does not exist or is closed."
          });
          return;
        }
        if (firestoreData.status === "closed" || firestoreData.status !== "active") {
          socket.emit("room-error", {
            code: "ROOM_CLOSED",
            message: "This room has been closed."
          });
          return;
        }
      }

      const room = getOrCreateRoom(roomId, firestoreData?.name || "Collaborative Workspace");
      
      // Preserve persistent ownerId from Firestore
      if (firestoreData?.ownerId) {
        room.owner = firestoreData.ownerId;
      }
      if (firestoreData?.name) {
        room.roomname = firestoreData.name;
      }
      if (firestoreData?.files && firestoreData.files.length > 0 && room.files.size <= 2) {
        room.files.clear();
        for (const f of firestoreData.files) {
          room.files.set(f.id, f);
        }
        replaceWorkspaceOnDisk(roomId, firestoreData.files);
      }

      // CRITICAL: Determine isHost strictly by comparing userId with persistent room.owner
      let isHost = false;
      if (room.owner && userId) {
        isHost = (room.owner === userId);
      } else if (room.owner) {
        isHost = false;
      } else {
        isHost = room.participants.size === 0;
        if (isHost && userId) {
          room.owner = userId;
        }
      }

      const initialActive = room.activeFileId || Array.from(room.files.values()).find((f) => !f.isFolder)?.id || "";

      socketUserMap.set(socket.id, {
        username: cleanUsername,
        userColor: color,
        roomId,
        activeFileId: initialActive,
      });

      room.participants.set(socket.id, {
        username: cleanUsername,
        userColor: color,
        isHost,
        userId: userId || undefined,
        activeFileId: initialActive,
      });
      room.lastUpdated = new Date().toISOString();

      socket.join(roomId);

      const clients = Array.from(room.participants.entries()).map(([socketId, data]) => ({
        socketId,
        userId: data.userId,
        username: data.username,
        userColor: data.userColor,
        isHost: data.isHost,
        activeFileId: data.activeFileId,
      }));

      const filesList = Array.from(room.files.values());

      // Send initial workspace state
      socket.emit("room-state", {
        roomId: room.roomId,
        projectId: room.roomId,
        roomname: room.roomname,
        files: filesList,
        activeFileId: room.activeFileId || initialActive,
        participants: clients,
      });

      // Broadcast joined client to other peers
      io.to(roomId).emit("joined", {
        clients,
        username: cleanUsername,
        socketId: socket.id,
        userColor: color,
      });

      // Keep all participants in sync
      io.to(roomId).emit("room-participants", clients);
    });

    // Yjs CRDT Synchronization Handlers
    // 1. Client requests document state / sends state vector
    socket.on("yjs-sync-step-1", ({ roomId, docId, stateVector, initialContent }) => {
      if (!roomId || !docId) return;
      const doc = getYDocForDocument(roomId, docId, initialContent);
      const sv = stateVector && stateVector.length > 0 ? new Uint8Array(stateVector) : undefined;
      const update = Y.encodeStateAsUpdate(doc, sv);
      socket.emit("yjs-sync-step-2", {
        docId,
        update: Array.from(update),
      });
    });

    // 2. Client sends document incremental updates
    socket.on("yjs-update", ({ roomId, docId, update }) => {
      if (!roomId || !docId || !update) return;
      const doc = getYDocForDocument(roomId, docId);
      const u8 = new Uint8Array(update);
      Y.applyUpdate(doc, u8, socket.id);

      // Broadcast to other collaborators in this room
      socket.to(roomId).emit("yjs-update", {
        docId,
        update,
      });
    });

    // 3. Client sends awareness updates (cursors, selections)
    socket.on("yjs-awareness", ({ roomId, docId, update }) => {
      if (!roomId || !docId || !update) return;
      socket.to(roomId).emit("yjs-awareness", {
        docId,
        update,
      });
    });

    // Workspace Replacement (Import = Replace Active Workspace)
    socket.on("workspace-replace", ({ roomId, files, activeFileId, projectName }) => {
      if (!roomId) return;
      let room = rooms.get(roomId);
      if (!room) {
        room = getOrCreateRoom(roomId, projectName || "Imported Project");
      }
      room.files.clear();
      if (projectName) room.roomname = projectName;
      if (activeFileId) room.activeFileId = activeFileId;

      // Clean up previous Yjs docs for this room
      for (const [key, ydoc] of roomYDocs.entries()) {
        if (key.includes(`room:${roomId}:`)) {
          ydoc.destroy();
          roomYDocs.delete(key);
        }
      }

      const serverFiles: ServerProjectFile[] = (files || []).map((f: any) => ({
        id: f.id,
        roomId,
        name: f.name,
        path: f.path,
        content: f.content || "",
        language: f.language || getLanguageFromFilename(f.name),
        isFolder: !!f.isFolder,
        parentPath: f.parentPath || "",
        version: 1,
        updatedAt: new Date().toISOString(),
      }));

      for (const sf of serverFiles) {
        room.files.set(sf.id, sf);
      }
      room.lastUpdated = new Date().toISOString();

      // Wipe disk workspace and write only the imported files
      replaceWorkspaceOnDisk(roomId, serverFiles);

      // Broadcast replacement to all collaborators in the room
      io.to(roomId).emit("workspace-replace", {
        files: serverFiles,
        activeFileId: room.activeFileId,
        projectName: room.roomname,
      });
    });

    // Fine-grained Delta Collaboration
    // Prevents overwriting document on concurrent keystrokes!
    socket.on("file-delta", ({ roomId, fileId, from, to, insert, version, authorId, authorName }) => {
      if (!roomId || !fileId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      const file = room.files.get(fileId);
      if (file) {
        // Apply differential insertion/deletion to server's in-memory buffer
        const current = file.content;
        const safeFrom = Math.max(0, Math.min(from, current.length));
        const safeTo = Math.max(safeFrom, Math.min(to, current.length));
        file.content = current.slice(0, safeFrom) + (insert || "") + current.slice(safeTo);
        file.version = (file.version || 1) + 1;
        file.updatedAt = new Date().toISOString();
        room.lastUpdated = file.updatedAt;

        // Sync to disk
        const diskPath = path.join(getRoomDiskDir(roomId), file.path);
        try {
          fs.mkdirSync(path.dirname(diskPath), { recursive: true });
          fs.writeFileSync(diskPath, file.content, "utf8");
        } catch (e) {}

        // Broadcast the specific delta to other collaborators in the room
        socket.to(roomId).emit("file-delta", {
          fileId,
          from: safeFrom,
          to: safeTo,
          insert: insert || "",
          version: file.version,
          authorId: authorId || socket.id,
          authorName: authorName || socketUserMap.get(socket.id)?.username || "Peer",
        });
      }
    });

    // Full Content update (e.g. Save, Paste large file, or Initial Sync)
    socket.on("file-content", ({ roomId, fileId, content }) => {
      if (!roomId || !fileId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      const file = room.files.get(fileId);
      if (file) {
        file.content = content;
        file.version = (file.version || 1) + 1;
        file.updatedAt = new Date().toISOString();
        room.lastUpdated = file.updatedAt;

        // Sync to disk
        const diskPath = path.join(getRoomDiskDir(roomId), file.path);
        try {
          fs.mkdirSync(path.dirname(diskPath), { recursive: true });
          fs.writeFileSync(diskPath, file.content, "utf8");
        } catch (e) {}

        socket.to(roomId).emit("file-content", {
          fileId,
          content,
          version: file.version,
          authorId: socket.id,
        });
      }
    });

    // User switched active file in editor
    socket.on("active-file-change", ({ roomId, fileId }) => {
      if (!roomId || !fileId) return;
      const room = rooms.get(roomId);
      const user = socketUserMap.get(socket.id);
      if (user) {
        user.activeFileId = fileId;
      }
      if (room && room.participants.has(socket.id)) {
        room.participants.get(socket.id)!.activeFileId = fileId;
      }
      socket.to(roomId).emit("active-file-change", {
        socketId: socket.id,
        fileId,
        username: user?.username,
      });
    });

    // Real-time Cursor & Selection Presence
    socket.on("cursor-position", ({ roomId, fileId, line, col, ch }) => {
      if (!roomId) return;
      const user = socketUserMap.get(socket.id);
      socket.to(roomId).emit("cursor-position", {
        userId: socket.id,
        username: user?.username || "Collaborator",
        userColor: user?.userColor || "#38bdf8",
        fileId,
        line,
        col,
        ch,
      });
    });

    // File Creation
    socket.on("file-create", ({ roomId, file }) => {
      if (!roomId || !file?.id) return;
      const room = rooms.get(roomId);
      if (room) {
        const serverFile: ServerProjectFile = {
          ...file,
          roomId,
          version: 1,
          updatedAt: new Date().toISOString(),
        };
        room.files.set(file.id, serverFile);

        // Sync to disk
        const diskPath = path.join(getRoomDiskDir(roomId), file.path);
        try {
          if (file.isFolder) {
            fs.mkdirSync(diskPath, { recursive: true });
          } else {
            fs.mkdirSync(path.dirname(diskPath), { recursive: true });
            fs.writeFileSync(diskPath, file.content || "", "utf8");
          }
        } catch (e) {}

        io.to(roomId).emit("file-create", { file: serverFile });
      }
    });

    // File Deletion
    socket.on("file-delete", ({ roomId, fileId, path: filePath }) => {
      if (!roomId || !fileId) return;
      const room = rooms.get(roomId);
      if (room) {
        room.files.delete(fileId);
        // Also delete children if folder
        for (const [id, f] of room.files.entries()) {
          if (f.path.startsWith(filePath + "/")) {
            room.files.delete(id);
          }
        }

        // Sync deletion on disk
        const diskPath = path.join(getRoomDiskDir(roomId), filePath);
        try {
          fs.rmSync(diskPath, { recursive: true, force: true });
        } catch (e) {}

        // Clean up matching YDocs
        for (const [key, ydoc] of roomYDocs.entries()) {
          if (key.includes(`room:${roomId}:`) && (key.endsWith(`:file:${filePath}`) || key.includes(`:file:${filePath}/`))) {
            ydoc.destroy();
            roomYDocs.delete(key);
          }
        }

        io.to(roomId).emit("file-delete", { fileId, path: filePath });
      }
    });

    // File Rename
    socket.on("file-rename", ({ roomId, fileId, newName, newPath }) => {
      if (!roomId || !fileId) return;
      const room = rooms.get(roomId);
      if (room) {
        const file = room.files.get(fileId);
        if (file) {
          const oldPath = file.path;
          file.name = newName;
          file.path = newPath;
          file.updatedAt = new Date().toISOString();

          // Rename subpaths if folder
          if (file.isFolder) {
            for (const f of room.files.values()) {
              if (f.path.startsWith(oldPath + "/")) {
                f.path = newPath + f.path.slice(oldPath.length);
                f.parentPath = newPath;
              }
            }
          }

          // Move any active YDoc keys
          for (const [key, ydoc] of Array.from(roomYDocs.entries())) {
            if (key.includes(`room:${roomId}:`) && key.endsWith(`:file:${oldPath}`)) {
              const newKey = key.replace(`:file:${oldPath}`, `:file:${newPath}`);
              roomYDocs.set(newKey, ydoc);
              roomYDocs.delete(key);
            }
          }

          // Sync rename on disk
          const roomDir = getRoomDiskDir(roomId);
          const oldDiskPath = path.join(roomDir, oldPath);
          const newDiskPath = path.join(roomDir, newPath);
          try {
            if (fs.existsSync(oldDiskPath)) {
              fs.mkdirSync(path.dirname(newDiskPath), { recursive: true });
              fs.renameSync(oldDiskPath, newDiskPath);
            }
          } catch (e) {}

          io.to(roomId).emit("file-rename", { fileId, newName, newPath, oldPath });
        }
      }
    });

    // Chat messaging
    socket.on("chat-message", ({ roomId, message }) => {
      if (!roomId || !message) return;
      const user = socketUserMap.get(socket.id);
      const payload = {
        id: "msg_" + Math.random().toString(36).substr(2, 9),
        sender: user?.username || "Collaborator",
        userColor: user?.userColor || "#38bdf8",
        text: message.text || message,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      io.to(roomId).emit("chat-message", payload);
    });

    // Terminal execution broadcast
    socket.on("code-output", ({ roomId, output }) => {
      if (!roomId) return;
      socket.to(roomId).emit("code-output", { output });
    });

    // WebRTC Real-Time Audio & Video Signaling
    socket.on("webrtc-join", ({ roomId, username, userColor, isVideoEnabled, isAudioEnabled }) => {
      if (!roomId) return;
      let callPeers = callRooms.get(roomId);
      if (!callPeers) {
        callPeers = new Map();
        callRooms.set(roomId, callPeers);
      }
      const existingPeers = Array.from(callPeers.values());
      const myPeerInfo: CallParticipant = {
        socketId: socket.id,
        username: username || socketUserMap.get(socket.id)?.username || "Collaborator",
        userColor: userColor || socketUserMap.get(socket.id)?.userColor || getRandomColor(),
        isVideoEnabled: isVideoEnabled !== false,
        isAudioEnabled: isAudioEnabled !== false,
        isScreenSharing: false,
      };
      callPeers.set(socket.id, myPeerInfo);

      // Send existing call peers to newcomer
      socket.emit("webrtc-existing-peers", { peers: existingPeers });

      // Broadcast newcomer to peers
      socket.to(roomId).emit("webrtc-user-joined", myPeerInfo);
    });

    socket.on("webrtc-offer", ({ targetSocketId, sdp, callerUsername }) => {
      if (!targetSocketId || !sdp) return;
      io.to(targetSocketId).emit("webrtc-offer", {
        callerSocketId: socket.id,
        callerUsername: callerUsername || socketUserMap.get(socket.id)?.username || "Peer",
        sdp,
      });
    });

    socket.on("webrtc-answer", ({ targetSocketId, sdp }) => {
      if (!targetSocketId || !sdp) return;
      io.to(targetSocketId).emit("webrtc-answer", {
        responderSocketId: socket.id,
        sdp,
      });
    });

    socket.on("webrtc-ice-candidate", ({ targetSocketId, candidate }) => {
      if (!targetSocketId || !candidate) return;
      io.to(targetSocketId).emit("webrtc-ice-candidate", {
        senderSocketId: socket.id,
        candidate,
      });
    });

    socket.on("webrtc-media-state", ({ roomId, isVideoEnabled, isAudioEnabled, isScreenSharing }) => {
      if (!roomId) return;
      const callPeers = callRooms.get(roomId);
      if (callPeers && callPeers.has(socket.id)) {
        const p = callPeers.get(socket.id)!;
        if (typeof isVideoEnabled === "boolean") p.isVideoEnabled = isVideoEnabled;
        if (typeof isAudioEnabled === "boolean") p.isAudioEnabled = isAudioEnabled;
        if (typeof isScreenSharing === "boolean") p.isScreenSharing = isScreenSharing;
      }
      socket.to(roomId).emit("webrtc-media-state", {
        socketId: socket.id,
        isVideoEnabled,
        isAudioEnabled,
        isScreenSharing,
      });
    });

    socket.on("webrtc-leave", ({ roomId }) => {
      if (!roomId) return;
      const callPeers = callRooms.get(roomId);
      if (callPeers) {
        callPeers.delete(socket.id);
      }
      socket.to(roomId).emit("webrtc-user-left", { socketId: socket.id });
    });

    // Room Host Management & Permissions
    socket.on("kick-user", ({ roomId, targetSocketId }) => {
      if (!roomId || !targetSocketId) return;
      const room = rooms.get(roomId);
      const caller = room?.participants.get(socket.id);
      if (caller?.isHost) {
        const target = room?.participants.get(targetSocketId);
        if (target) {
          room.participants.delete(targetSocketId);
          io.to(targetSocketId).emit("kicked-from-room", { reason: "You have been removed from the session by the host." });
          io.to(roomId).emit("user-kicked", { targetUsername: target.username });
          const clients = Array.from(room.participants.entries()).map(([sId, data]) => ({
            socketId: sId,
            username: data.username,
            userColor: data.userColor,
            isHost: data.isHost,
            activeFileId: data.activeFileId,
          }));
          io.to(roomId).emit("room-participants", clients);
        }
      }
    });

    socket.on("transfer-host", ({ roomId, targetSocketId }) => {
      if (!roomId || !targetSocketId) return;
      const room = rooms.get(roomId);
      const caller = room?.participants.get(socket.id);
      if (caller?.isHost) {
        const target = room?.participants.get(targetSocketId);
        if (target) {
          caller.isHost = false;
          target.isHost = true;
          room.owner = target.username;
          const clients = Array.from(room.participants.entries()).map(([sId, data]) => ({
            socketId: sId,
            username: data.username,
            userColor: data.userColor,
            isHost: data.isHost,
            activeFileId: data.activeFileId,
          }));
          io.to(roomId).emit("room-participants", clients);
          io.to(roomId).emit("host-transferred", { newHostUsername: target.username });
        }
      }
    });

    socket.on("update-room-permissions", ({ roomId, isReadOnly, passcode }) => {
      if (!roomId) return;
      const room = rooms.get(roomId);
      const caller = room?.participants.get(socket.id);
      if (caller?.isHost) {
        if (typeof isReadOnly === "boolean") room.isReadOnly = isReadOnly;
        if (typeof passcode === "string") room.passcode = passcode;
        io.to(roomId).emit("room-permissions-updated", {
          isReadOnly: room.isReadOnly,
          hasPasscode: !!room.passcode,
        });
      }
    });

    socket.on("delete-room", ({ roomId }) => {
      if (!roomId) return;
      const room = rooms.get(roomId);
      const caller = room?.participants.get(socket.id);
      if (caller?.isHost) {
        closedRooms.add(roomId);
        io.to(roomId).emit("room-deleted", { reason: "The room was deleted by the host." });
        rooms.delete(roomId);
        callRooms.delete(roomId);
      }
    });

    // Disconnection & Leave
    const handleLeave = (rId: string) => {
      const room = rooms.get(rId);
      const user = socketUserMap.get(socket.id);

      // Clean up WebRTC call participant
      const callPeers = callRooms.get(rId);
      if (callPeers && callPeers.has(socket.id)) {
        callPeers.delete(socket.id);
        socket.to(rId).emit("webrtc-user-left", { socketId: socket.id });
      }

      if (room) {
        room.participants.delete(socket.id);
        socket.to(rId).emit("disconnected", {
          socketId: socket.id,
          username: user?.username,
        });

        const clients = Array.from(room.participants.entries()).map(([socketId, data]) => ({
          socketId,
          username: data.username,
          userColor: data.userColor,
          isHost: data.isHost,
          activeFileId: data.activeFileId,
        }));
        socket.to(rId).emit("room-participants", clients);
      }
      socket.leave(rId);
    };

    socket.on("leave-room", ({ roomId }) => handleLeave(roomId));

    socket.on("disconnecting", () => {
      const joinedRooms = Array.from(socket.rooms);
      joinedRooms.forEach((rId) => {
        if (rId !== socket.id) handleLeave(rId);
      });
    });

    socket.on("disconnect", () => {
      socketUserMap.delete(socket.id);
    });
  });

  // REST API Routes

  // Health
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Auth: Register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ message: "Username, email, and password are required" });
      }

      if (users.has(email)) {
        return res.status(400).json({ message: "User already exists with this email" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user: StoredUser = {
        id: "usr_" + Math.random().toString(36).substr(2, 9),
        username,
        email,
        passwordHash,
        createdAt: new Date().toISOString(),
      };
      users.set(email, user);

      const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
      res.status(201).json({
        message: "Registration successful",
        token,
        user: { id: user.id, username: user.username, email: user.email },
      });
    } catch (err) {
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Auth: Login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = users.get(email);
      if (!user) {
        const passwordHash = await bcrypt.hash(password, 10);
        const newUser: StoredUser = {
          id: "usr_" + Math.random().toString(36).substr(2, 9),
          username: email.split("@")[0] || "User",
          email,
          passwordHash,
          createdAt: new Date().toISOString(),
        };
        users.set(email, newUser);
        const token = jwt.sign({ id: newUser.id, username: newUser.username, email: newUser.email }, JWT_SECRET, { expiresIn: "7d" });
        return res.json({
          token,
          user: { id: newUser.id, username: newUser.username, email: newUser.email },
        });
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
      res.json({
        token,
        user: { id: user.id, username: user.username, email: user.email },
      });
    } catch (err) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Auth: Guest Instant Access
  app.post("/api/auth/guest", (req: Request, res: Response) => {
    const { username } = req.body;
    const cleanUsername = username?.trim() || `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
    const guestUser = {
      id: "guest_" + Math.random().toString(36).substr(2, 9),
      username: cleanUsername,
      email: `${cleanUsername.toLowerCase()}@guest.local`,
    };
    const token = jwt.sign(guestUser, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: guestUser });
  });

  // Validate if a room exists and is joinable
  const handleValidateRoom = async (req: Request, res: Response) => {
    const rawRoomId = (req.params.roomId || req.query.roomId || "") as string;
    const roomId = rawRoomId.trim();
    if (!roomId) return res.status(400).json({ valid: false, message: "Room ID is required" });
    
    if (closedRooms.has(roomId)) {
      return res.json({ 
        valid: false, 
        code: "ROOM_CLOSED",
        reason: "closed", 
        message: "This room is no longer available." 
      });
    }

    // Extract optional Bearer token
    const authHeader = req.headers.authorization || req.headers.Authorization as string || "";
    let idToken = "";
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      idToken = authHeader.substring(7).trim();
    }

    // 1. Authoritative check in Firestore
    const firestoreData = await loadRoomFromFirestoreOnServer(roomId, idToken);
    if (firestoreData) {
      if (!firestoreData.exists) {
        return res.json({ 
          valid: false, 
          code: "ROOM_NOT_FOUND",
          reason: "not_found", 
          message: "Room not found" 
        });
      }

      if (firestoreData.status === "closed" || firestoreData.status !== "active") {
        return res.json({ 
          valid: false, 
          code: "ROOM_CLOSED",
          reason: "closed", 
          message: "This room is no longer available." 
        });
      }

      let room = rooms.get(roomId);
      if (room) {
        if (firestoreData.ownerId) room.owner = firestoreData.ownerId;
        if (firestoreData.name) room.roomname = firestoreData.name;
      }

      return res.json({
        valid: true,
        roomId,
        name: firestoreData.name,
        roomname: firestoreData.name,
        ownerId: firestoreData.ownerId,
        status: "active",
        isReadOnly: false,
      });
    }

    // 2. Fallback to in-memory/disk check
    const status = checkRoomStatus(roomId);
    if (status.isClosed) {
      return res.json({ valid: false, code: "ROOM_CLOSED", reason: "closed", message: "This room is no longer available." });
    }
    if (!status.exists) {
      return res.json({ valid: false, code: "ROOM_NOT_FOUND", reason: "not_found", message: "Room not found" });
    }

    const memRoom = rooms.get(roomId);
    return res.json({
      valid: true,
      roomId,
      name: status.roomname || "CODE DEATH Workspace",
      roomname: status.roomname || "CODE DEATH Workspace",
      ownerId: memRoom?.owner || "",
      status: "active",
      isReadOnly: status.isReadOnly || false,
      hasPasscode: status.hasPasscode || false,
    });
  };

  app.get("/api/room/validate/:roomId", handleValidateRoom);
  app.get("/api/room/validate", handleValidateRoom);

  // Explicitly create a new room
  app.post("/api/room/create", async (req: Request, res: Response) => {
    // 1. Method & Auth check
    const authHeader = req.headers.authorization || req.headers.Authorization as string || "";
    let idToken = "";
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      idToken = authHeader.substring(7).trim();
    }

    let authenticatedUid = "";

    // Resolve Firebase config
    let apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";
    if (!apiKey) {
      try {
        const configPath = path.join(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
          apiKey = raw.apiKey;
        }
      } catch {
        // Ignore
      }
    }

    if (idToken && apiKey) {
      try {
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`;
        const lookupRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        if (lookupRes.ok) {
          const uData = await lookupRes.json() as any;
          if (uData.users && uData.users[0]) {
            authenticatedUid = uData.users[0].localId;
          }
        }
      } catch (err) {
        console.warn("Could not verify Firebase token on server:", err);
      }
    }

    const { roomId, roomName, roomname, hostId } = req.body || {};

    // If hostId was sent and token verified, ensure they match
    if (authenticatedUid && hostId && hostId !== authenticatedUid) {
      return res.status(403).json({
        success: false,
        message: "Host ID does not match authenticated user.",
        code: "FORBIDDEN",
      });
    }

    const finalHostId = authenticatedUid || hostId || "";
    if (!finalHostId && !idToken) {
      return res.status(401).json({
        success: false,
        message: "Authentication required to create a workspace room.",
        code: "UNAUTHORIZED",
      });
    }

    // Room ID validation
    let targetId = (roomId || "").trim();
    if (targetId) {
      if (!/^[a-zA-Z0-9_-]{3,64}$/.test(targetId)) {
        return res.status(400).json({
          success: false,
          message: "Room ID must be 3-64 characters and contain only letters, numbers, underscores, or hyphens.",
          code: "INVALID_ROOM_ID",
        });
      }

      // Check collision with existing active room
      if (rooms.has(targetId) && !closedRooms.has(targetId)) {
        const existing = rooms.get(targetId);
        if (existing && existing.owner && existing.owner !== finalHostId) {
          return res.status(409).json({
            success: false,
            message: "Room ID already exists. Choose another ID.",
            code: "ROOM_ALREADY_EXISTS",
          });
        }
      }
    } else {
      targetId = "cd_" + Math.random().toString(36).substring(2, 9);
    }

    if (closedRooms.has(targetId)) {
      closedRooms.delete(targetId);
    }

    const targetRoomName = (roomName || roomname || "Collaborative Workspace").trim();
    if (targetRoomName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Room name must be under 100 characters.",
        code: "INVALID_ROOM_NAME",
      });
    }

    const room = getOrCreateRoom(targetId, targetRoomName);
    if (finalHostId) {
      room.owner = finalHostId;
    }

    if (finalHostId && idToken) {
      const { projectId } = getFirebaseServerConfig();
      if (projectId) {
        try {
          const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/rooms/${encodeURIComponent(targetId)}`;
          const now = new Date().toISOString();
          await fetch(url, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              fields: {
                id: { stringValue: targetId },
                name: { stringValue: targetRoomName },
                hostId: { stringValue: finalHostId },
                ownerId: { stringValue: finalHostId },
                createdBy: { stringValue: finalHostId },
                status: { stringValue: "active" },
                createdAt: { stringValue: now },
                updatedAt: { stringValue: now },
              },
            }),
          });
        } catch (err) {
          console.warn("Could not sync room to Firestore from server:", err);
        }
      }
    }

    return res.status(201).json({
      success: true,
      room: {
        roomId: room.roomId,
        roomName: room.roomname,
        hostId: room.owner,
        createdAt: new Date().toISOString(),
      },
    });
  });

  // Load room files and metadata
  app.get("/api/room/load/:roomId", (req: Request, res: Response) => {
    const { roomId } = req.params;
    const room = getOrCreateRoom(roomId);
    res.json({
      roomId: room.roomId,
      roomname: room.roomname,
      activeFileId: room.activeFileId,
      files: Array.from(room.files.values()),
      participantsCount: room.participants.size,
      lastUpdated: room.lastUpdated,
    });
  });

  // Save room files to server
  app.post("/api/room/save", (req: Request, res: Response) => {
    const { roomId, files, activeFileId, roomname } = req.body;
    if (!roomId) return res.status(400).json({ error: "Room ID is required" });

    const room = getOrCreateRoom(roomId, roomname);
    if (roomname) room.roomname = roomname;
    if (activeFileId) room.activeFileId = activeFileId;
    if (Array.isArray(files)) {
      files.forEach((f: ServerProjectFile) => {
        if (f.id) {
          room.files.set(f.id, {
            ...f,
            updatedAt: new Date().toISOString(),
          });
        }
      });
    }
    room.lastUpdated = new Date().toISOString();
    res.json({ success: true, roomId: room.roomId, fileCount: room.files.size });
  });

  // Replace Room Workspace completely (Import = Replace Active Workspace)
  app.post("/api/room/replace-workspace", (req: Request, res: Response) => {
    const { roomId, files, activeFileId, roomname } = req.body;
    if (!roomId) return res.status(400).json({ error: "Room ID is required" });

    let room = rooms.get(roomId);
    if (!room) {
      room = getOrCreateRoom(roomId, roomname || "Project Workspace");
    }

    room.files.clear();
    if (roomname) room.roomname = roomname;
    if (activeFileId) room.activeFileId = activeFileId;

    const serverFiles: ServerProjectFile[] = (files || []).map((f: any) => ({
      id: f.id,
      roomId,
      name: f.name,
      path: f.path,
      content: f.content || "",
      language: f.language || getLanguageFromFilename(f.name),
      isFolder: !!f.isFolder,
      parentPath: f.parentPath || "",
      version: 1,
      updatedAt: new Date().toISOString(),
    }));

    for (const sf of serverFiles) {
      room.files.set(sf.id, sf);
    }
    room.lastUpdated = new Date().toISOString();

    // Wipe disk workspace and write only imported files
    replaceWorkspaceOnDisk(roomId, serverFiles);

    // Broadcast replacement to all collaborators
    io.to(roomId).emit("workspace-replace", {
      files: serverFiles,
      activeFileId: room.activeFileId,
      projectName: room.roomname,
    });

    res.json({
      success: true,
      roomId: room.roomId,
      fileCount: room.files.size,
      projectName: room.roomname,
    });
  });

  // Load Demo Project explicitly
  app.post("/api/room/load-demo", (req: Request, res: Response) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: "Room ID required" });
    const room = getOrCreateRoom(roomId, "Live Collaborative Workspace", true);
    const demoFilesMap = createDefaultFiles(roomId);
    room.files.clear();
    for (const [id, f] of demoFilesMap.entries()) {
      room.files.set(id, f);
    }
    room.activeFileId = "f_app";
    room.lastUpdated = new Date().toISOString();
    const demoList = Array.from(demoFilesMap.values());
    replaceWorkspaceOnDisk(roomId, demoList);

    io.to(roomId).emit("workspace-replace", {
      files: demoList,
      activeFileId: "f_app",
      projectName: "Live Collaborative Workspace",
    });

    res.json({ success: true, files: demoList, activeFileId: "f_app" });
  });

  // Lazy-load direct children of any directory on disk (especially node_modules)
  app.get("/api/workspace/fs-children", (req: Request, res: Response) => {
    const roomId = (req.query.roomId as string) || "default";
    const dirPath = (req.query.dirPath as string) || "";
    const roomDir = getRoomDiskDir(roomId);
    const targetDir = path.resolve(roomDir, dirPath);

    // Prevent path traversal outside of workspace
    if (!targetDir.startsWith(roomDir)) {
      return res.status(403).json({ error: "Access denied", entries: [] });
    }

    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      return res.status(404).json({ error: "Directory not found", entries: [] });
    }

    try {
      const items = fs.readdirSync(targetDir, { withFileTypes: true });
      const entries = items.map((item) => {
        const itemRelPath = dirPath ? `${dirPath}/${item.name}` : item.name;
        const isFolder = item.isDirectory() || item.isSymbolicLink();
        return {
          name: item.name,
          path: itemRelPath,
          isFolder,
        };
      });

      // Sort folders first, then files
      entries.sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      });

      res.json({ dirPath, entries });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to read directory", entries: [] });
    }
  });

  // Read real file content from workspace (for lazy-loaded node_modules files)
  app.get("/api/workspace/file-content", (req: Request, res: Response) => {
    const roomId = (req.query.roomId as string) || "default";
    const filePath = (req.query.filePath as string) || "";
    const roomDir = getRoomDiskDir(roomId);
    const targetFile = path.resolve(roomDir, filePath);

    if (!targetFile.startsWith(roomDir)) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
      return res.status(404).json({ error: "File not found" });
    }

    try {
      const stat = fs.statSync(targetFile);
      if (stat.size > 2 * 1024 * 1024) {
        return res.json({ content: `[File too large to display (${Math.round(stat.size / 1024)} KB)]`, path: filePath });
      }
      const content = fs.readFileSync(targetFile, "utf8");
      res.json({ content, path: filePath });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to read file" });
    }
  });

  // Manual or programmatic file explorer disk sync
  app.post("/api/workspace/sync", (req: Request, res: Response) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: "Room ID is required" });

    const room = getOrCreateRoom(roomId);
    const { created, deleted, updated } = syncDiskFilesToRoom(roomId);

    if (io) {
      for (const file of created) io.to(roomId).emit("file-create", { file });
      for (const fileId of deleted) io.to(roomId).emit("file-delete", { fileId, path: "" });
      for (const file of updated) io.to(roomId).emit("file-update", { file });
    }

    res.json({
      success: true,
      createdCount: created.length,
      deletedCount: deleted.length,
      updatedCount: updated.length,
      files: Array.from(room.files.values()),
    });
  });

  // Kill running background command in room
  app.post("/api/terminal/kill", async (req: Request, res: Response) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: "Room ID is required" });

    const killed = await stopManagedProcess(roomId);
    if (killed) {
      return res.json({ success: true, message: "Development process stopped and port released" });
    }
    return res.json({ success: true, message: "No active process was running" });
  });

  // Check terminal process status for a room
  app.get("/api/terminal/status", (req: Request, res: Response) => {
    const roomId = (req.query.roomId as string) || "default";
    const managed = activeProcesses.get(roomId);
    if (!managed || managed.status === "STOPPED" || managed.status === "EXITED") {
      return res.json({
        isRunning: false,
        status: "STOPPED",
        command: null,
        pid: null,
        detectedPort: null,
        uptimeSeconds: 0,
      });
    }
    return res.json({
      isRunning: managed.status === "RUNNING" || managed.status === "STARTING",
      status: managed.status,
      command: managed.command,
      pid: managed.pid,
      detectedPort: managed.detectedPort,
      uptimeSeconds: Math.floor((Date.now() - managed.startedAt) / 1000),
    });
  });

  // Cleanly restart development server for a room
  app.post("/api/terminal/restart", async (req: Request, res: Response) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: "Room ID is required" });

    const session = getRoomTerminalSession(roomId);
    const room = getOrCreateRoom(roomId);
    const roomFiles = Array.from(room.files.values());
    const projectInfo = detectProject(roomFiles);
    const cmdToRun = projectInfo.primaryRunCommand || "bun run dev";

    const result = await executeCommandWithLifecycle({
      command: cmdToRun,
      cwd: session.projectRoot,
      roomId,
      projectInfo,
      restartIfRunning: true,
    });

    return res.json({
      success: true,
      command: cmdToRun,
      stdout: result.stdout,
      stderr: result.stderr,
      detectedPort: result.detectedPort,
      status: result.status,
      isRunning: result.isRunning,
    });
  });

  // Dev server reverse proxy helper for live iframe / preview tab
  function proxyRequestToDevServer(
    req: Request,
    res: Response,
    targetPort: number,
    targetPath: string
  ) {
    if (RESERVED_PORTS.has(targetPort)) {
      return res.status(403).send(
        `<div style="font-family:ui-sans-serif,system-ui,sans-serif;padding:32px;background:#090d16;color:#94a3b8;min-height:100vh;">
          <h3 style="color:#f43f5e;margin-bottom:8px;">Internal System Port</h3>
          <p style="margin-bottom:12px;">Port ${targetPort} is reserved for internal IDE infrastructure. Please use an assigned project development server port.</p>
        </div>`
      );
    }

    const proxyHeaders = { ...req.headers };
    proxyHeaders.host = `localhost:${targetPort}`;
    // Strip accept-encoding to allow HTML transformation if needed
    delete proxyHeaders["accept-encoding"];

    const subPath = targetPath.startsWith("/") ? targetPath : "/" + targetPath;

    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: targetPort,
        path: subPath,
        method: req.method,
        headers: proxyHeaders,
      },
      (proxyRes) => {
        const contentType = (proxyRes.headers["content-type"] as string) || "";
        const isHtml = contentType.toLowerCase().includes("text/html");

        const resHeaders: http.OutgoingHttpHeaders = { ...proxyRes.headers };
        // Strip framing restrictions so the iframe loads inside the IDE
        delete resHeaders["x-frame-options"];
        delete resHeaders["content-security-policy"];
        delete resHeaders["cross-origin-embedder-policy"];
        delete resHeaders["cross-origin-opener-policy"];

        // Set preview tracking cookie for relative asset requests
        res.setHeader("Set-Cookie", `cd_preview_port=${targetPort}; Path=/; SameSite=Lax`);

        if (isHtml) {
          const chunks: Buffer[] = [];
          proxyRes.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          proxyRes.on("end", () => {
            let html = Buffer.concat(chunks).toString("utf8");

            // 1. Inject base href and preview port shim
            const shim = `\n    <base href="/api/preview/${targetPort}/" />\n    <script>window.__CODE_DEATH_PREVIEW_PORT__ = ${targetPort};</script>\n`;
            if (html.includes("<head>")) {
              html = html.replace("<head>", "<head>" + shim);
            } else if (html.includes("<head ")) {
              html = html.replace(/<head[^>]*>/, "$&" + shim);
            } else {
              html = shim + html;
            }

            // 2. Rewrite root-absolute asset paths in HTML (e.g. src="/src/main.tsx" -> src="/api/preview/${targetPort}/src/main.tsx")
            html = html.replace(/src="\/([a-zA-Z0-9@_.~/-]+)"/g, (match, p1) => {
              if (p1.startsWith("api/preview/")) return match;
              return `src="/api/preview/${targetPort}/${p1}"`;
            });
            html = html.replace(/href="\/([a-zA-Z0-9@_.~/-]+)"/g, (match, p1) => {
              if (p1.startsWith("api/preview/")) return match;
              return `href="/api/preview/${targetPort}/${p1}"`;
            });

            delete resHeaders["content-length"];
            resHeaders["content-type"] = "text/html; charset=utf-8";
            res.writeHead(proxyRes.statusCode || 200, resHeaders);
            res.end(html);
          });
        } else {
          res.writeHead(proxyRes.statusCode || 200, resHeaders);
          proxyRes.pipe(res);
        }
      }
    );

    proxyReq.on("error", (err) => {
      res.status(502).send(
        `<div style="font-family:ui-sans-serif,system-ui,sans-serif;padding:32px;background:#090d16;color:#94a3b8;min-height:100vh;">
          <h3 style="color:#38bdf8;margin-bottom:8px;">Development Server Connecting...</h3>
          <p style="margin-bottom:12px;">Port ${targetPort} is currently starting or offline.</p>
          <p style="font-size:12px;color:#64748b;">${err.message}</p>
        </div>`
      );
    });

    req.pipe(proxyReq);
  }

  // Dev server reverse proxy endpoint
  app.use("/api/preview/:port", (req: Request, res: Response) => {
    const port = parseInt(req.params.port, 10);
    if (isNaN(port) || port < 1000 || port > 65535) {
      return res.status(400).send("Invalid preview port");
    }
    const subPath = req.url || "/";
    proxyRequestToDevServer(req, res, port, subPath);
  });

  // Project Runtime Status API
  app.get("/api/project/status/:roomId", (req: Request, res: Response) => {
    const { roomId } = req.params;
    const state = projectRuntimeStates.get(roomId) || {
      workspaceId: roomId,
      projectId: "workspace",
      processId: undefined,
      port: null,
      host: "0.0.0.0",
      status: "STOPPED",
      previewUrl: null,
    };
    res.json(state);
  });

  // Project Run API
  app.post("/api/project/run", async (req: Request, res: Response) => {
    const { roomId, activeFilePath } = req.body;
    if (!roomId) return res.status(400).json({ error: "roomId is required" });

    const room = rooms.get(roomId);
    const fileList = room ? Array.from(room.files.values()) : [];
    const projectInfo = detectProject(fileList, activeFilePath);
    const cmdToRun = projectInfo.primaryRunCommand || "npm run dev";

    const session = getRoomTerminalSession(roomId);
    const cwd = session ? session.projectRoot : getRoomDiskDir(roomId);

    const result = await executeCommandWithLifecycle({
      command: cmdToRun,
      cwd,
      roomId,
      projectInfo,
      restartIfRunning: true,
    });

    res.json({
      success: result.status === "RUNNING",
      status: result.status,
      detectedPort: result.detectedPort,
      previewUrl: result.detectedPort ? `/api/preview/${result.detectedPort}/` : null,
      stdout: result.stdout,
      stderr: result.stderr,
      command: cmdToRun,
    });
  });

  // Project Stop API
  app.post("/api/project/stop", async (req: Request, res: Response) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: "roomId is required" });
    await stopManagedProcess(roomId);
    res.json({ success: true, status: "STOPPED" });
  });

  // Project Restart API
  app.post("/api/project/restart", async (req: Request, res: Response) => {
    const { roomId, activeFilePath } = req.body;
    if (!roomId) return res.status(400).json({ error: "roomId is required" });
    await stopManagedProcess(roomId);
    await new Promise((r) => setTimeout(r, 400));

    const room = rooms.get(roomId);
    const fileList = room ? Array.from(room.files.values()) : [];
    const projectInfo = detectProject(fileList, activeFilePath);
    const cmdToRun = projectInfo.primaryRunCommand || "npm run dev";

    const session = getRoomTerminalSession(roomId);
    const cwd = session ? session.projectRoot : getRoomDiskDir(roomId);

    const result = await executeCommandWithLifecycle({
      command: cmdToRun,
      cwd,
      roomId,
      projectInfo,
      restartIfRunning: true,
    });

    res.json({
      success: result.status === "RUNNING",
      status: result.status,
      detectedPort: result.detectedPort,
      previewUrl: result.detectedPort ? `/api/preview/${result.detectedPort}/` : null,
      stdout: result.stdout,
      stderr: result.stderr,
      command: cmdToRun,
    });
  });

  // Delete Room
  app.delete("/api/room/:roomId", (req: Request, res: Response) => {
    const { roomId } = req.params;
    if (rooms.has(roomId)) {
      io.to(roomId).emit("room-deleted", { reason: "The room has been deleted by the owner." });
      rooms.delete(roomId);
      callRooms.delete(roomId);
      roomTerminalSessions.delete(roomId);
      return res.json({ success: true, message: `Room ${roomId} deleted.` });
    }
    return res.status(404).json({ error: "Room not found" });
  });

  // List recent active rooms
  app.get("/api/rooms", (_req: Request, res: Response) => {
    const roomList = Array.from(rooms.values()).map((r) => ({
      roomId: r.roomId,
      roomname: r.roomname,
      language: "javascript",
      participantsCount: r.participants.size,
      lastUpdated: r.lastUpdated,
    }));
    res.json(roomList);
  });

  // Safe Sandboxed Code Execution API
  app.post("/api/execute", async (req: Request, res: Response) => {
    const { language, code, roomId, filePath } = req.body;
    if (code === undefined || code === null) {
      return res.status(400).json({ error: "Code is required" });
    }

    const startTime = Date.now();
    const session = roomId ? getRoomTerminalSession(roomId) : null;
    const cwd = session ? session.projectRoot : (roomId ? getRoomDiskDir(roomId) : undefined);
    if (roomId) {
      ensureRoomDiskSynced(roomId);
    }

    const room = roomId ? rooms.get(roomId) : null;
    const fileList = room ? Array.from(room.files.values()) : [];
    const projectInfo = detectProject(fileList, filePath);

    // If active workspace has a dev script, or is a React/Vite/Next project, run dev server
    if (projectInfo.hasDevScript || projectInfo.projectType === "react-vite" || projectInfo.projectType === "next" || (filePath && (filePath.endsWith(".jsx") || filePath.endsWith(".tsx")))) {
      const cmdToRun = projectInfo.primaryRunCommand || "npm run dev";
      const result = await executeCommandWithLifecycle({
        command: cmdToRun,
        cwd: cwd || os.tmpdir(),
        roomId,
        projectInfo,
        restartIfRunning: true,
      });
      return res.json({
        stdout: `[CODE DEATH Runner]: Detected active web project. Running development server (${cmdToRun}):\n\n` + result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode ?? 0,
        executionTime: Date.now() - startTime,
        detectedPort: result.detectedPort,
        isRunning: result.isRunning,
        status: result.status,
      });
    }

    if (language === "python") {
      const result = await executePythonCode(code, 15000, cwd, filePath);
      return res.json({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        executionTime: Date.now() - startTime,
      });
    }

    if (language === "javascript" || language === "typescript") {
      const result = await executeNodeCode(code, 15000, cwd, filePath);
      return res.json({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        executionTime: Date.now() - startTime,
      });
    }

    if (language === "html" || language === "css") {
      return res.json({
        stdout: `HTML/CSS documents are rendered in the browser preview panel. Exit 0.`,
        stderr: "",
        exitCode: 0,
        executionTime: Date.now() - startTime,
      });
    }

    // Default: for other languages, clearly indicate runtime support
    res.json({
      stdout: `[CODE DEATH Runner]: Direct execution for ${language.toUpperCase()} is not configured in this container environment. Supported runtime targets: Python, JavaScript, TypeScript, HTML/CSS.`,
      stderr: "",
      exitCode: 0,
      executionTime: Date.now() - startTime,
    });
  });

  // Interactive Terminal Command Execution
  app.post("/api/terminal/execute", async (req: Request, res: Response) => {
    const { command, roomId, activeFileId, activeFilePath } = req.body;
    if (!command) return res.status(400).json({ error: "Command required" });

    const trimmed = command.trim();
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const room = roomId ? getOrCreateRoom(roomId) : null;
    const session = roomId ? getRoomTerminalSession(roomId) : {
      roomId: "default",
      projectRoot: os.tmpdir(),
      cwd: os.tmpdir(),
      relCwd: "",
    };

    if (roomId) {
      ensureRoomDiskSynced(roomId);
    }

    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    let detectedPort: number | null | undefined = null;
    const startTime = Date.now();

    switch (cmd) {
      case "help":
        stdout = `Available CODE DEATH Terminal Commands:
  run [file]         Project-aware runner (detects dev scripts, entry points, or file runtime)
  cd [dir]           Change directory within workspace (e.g. cd src, cd .., cd ~)
  pwd                Print current working directory
  ls / dir           List files in current working directory
  cat <file>         Display file contents
  touch <file>       Create a new file in workspace (synced to editor)
  mkdir <dir>        Create a new folder in workspace
  rm <file>          Remove a file or folder
  npm <script>       Execute package manager script (e.g. npm run dev, npm test)
  yarn / pnpm / bun  Execute package manager commands
  python3 <file>     Run Python file
  node <file>        Run JavaScript file
  date               Print current UTC date and time
  echo [text]        Print text to console
  clear              Clear terminal screen
  whoami             Show current user identity`;
        break;

      case "cd": {
        const rawTarget = args.join(" ").trim();
        if (!rawTarget || rawTarget === "~" || rawTarget === "/" || rawTarget === ".") {
          session.cwd = session.projectRoot;
          session.relCwd = "";
        } else if (rawTarget === "..") {
          const parentDir = path.dirname(session.cwd);
          const rel = path.relative(session.projectRoot, parentDir);
          if (rel.startsWith("..")) {
            session.cwd = session.projectRoot;
            session.relCwd = "";
          } else {
            session.cwd = parentDir;
            session.relCwd = rel === "." ? "" : rel;
          }
        } else {
          const target = path.resolve(session.cwd, rawTarget);
          const rel = path.relative(session.projectRoot, target);
          if (rel.startsWith("..")) {
            stderr = "cd: permission denied: cannot navigate above workspace root";
            exitCode = 1;
          } else if (!fs.existsSync(target)) {
            stderr = `cd: no such file or directory: ${rawTarget}`;
            exitCode = 1;
          } else if (!fs.statSync(target).isDirectory()) {
            stderr = `cd: not a directory: ${rawTarget}`;
            exitCode = 1;
          } else {
            session.cwd = target;
            session.relCwd = rel === "." ? "" : rel;
          }
        }
        break;
      }

      case "pwd": {
        const cleanProj = (roomId || "workspace").replace(/[^a-zA-Z0-9._-]/g, "_");
        stdout = `/workspace/workspaces/${cleanProj}${session.relCwd ? "/" + session.relCwd : ""}`;
        break;
      }

      case "date":
        stdout = new Date().toUTCString();
        break;

      case "echo":
        stdout = args.join(" ");
        break;

      case "whoami":
        stdout = "developer";
        break;

      case "clear":
        stdout = "";
        break;

      case "cat": {
        if (!args[0]) {
          stderr = "Usage: cat <filename>";
          exitCode = 1;
        } else {
          const targetPath = path.resolve(session.cwd, args.join(" "));
          const rel = path.relative(session.projectRoot, targetPath);
          if (rel.startsWith("..")) {
            stderr = `cat: access denied outside workspace`;
            exitCode = 1;
          } else if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
            stdout = fs.readFileSync(targetPath, "utf8");
          } else {
            stderr = `cat: ${args[0]}: No such file or directory`;
            exitCode = 1;
          }
        }
        break;
      }

      case "run": {
        const roomFiles = room ? Array.from(room.files.values()) : [];
        const targetPathStr = args[0] || activeFilePath;
        const projectInfo = detectProject(roomFiles, targetPathStr);
        let cmdToRun = projectInfo.primaryRunCommand;

        // If explicitly requested a file, check if it's JSX/TSX
        if (targetPathStr) {
          const ext = targetPathStr.split(".").pop()?.toLowerCase();
          if (ext === "jsx" || ext === "tsx") {
            stdout = `[CODE DEATH Runner]: JSX/TSX files cannot be executed directly by Node. Starting project dev server...\n`;
            cmdToRun = projectInfo.hasDevScript ? `${projectInfo.packageManager === "npm" ? "npm run " : `${projectInfo.packageManager} `}dev` : "bun run dev";
          }
        }

        stdout += `> ${cmdToRun}\n`;
        const shellRes = await executeCommandWithLifecycle({
          command: cmdToRun,
          cwd: session.projectRoot,
          roomId,
          projectInfo,
        });
        stdout += shellRes.stdout;
        stderr = shellRes.stderr;
        exitCode = shellRes.exitCode ?? 0;
        detectedPort = shellRes.detectedPort;
        break;
      }

      default: {
        // Automatically ensure package.json exists if running npm install or npm i in empty directory
        if (trimmed.startsWith("npm install") || trimmed.startsWith("npm i")) {
          const pkgPath = path.join(session.cwd, "package.json");
          if (!fs.existsSync(pkgPath)) {
            const defaultPkg = {
              name: room?.roomname ? room.roomname.toLowerCase().replace(/[^a-z0-9_-]/g, "-") : "code-death-workspace",
              version: "1.0.0",
              private: true,
              type: "module",
              scripts: {
                dev: "vite",
                build: "vite build",
                preview: "vite preview",
              },
              dependencies: {},
            };
            fs.writeFileSync(pkgPath, JSON.stringify(defaultPkg, null, 2), "utf8");
          }
        }

        // Execute via Process Lifecycle Manager
        const roomFiles = room ? Array.from(room.files.values()) : [];
        const projectInfo = detectProject(roomFiles, activeFilePath);
        const shellRes = await executeCommandWithLifecycle({
          command: trimmed,
          cwd: session.cwd,
          roomId,
          projectInfo,
        });
        stdout = shellRes.stdout;
        stderr = shellRes.stderr;
        exitCode = shellRes.exitCode ?? 0;
        detectedPort = shellRes.detectedPort;

        // Sync disk changes back to room memory and broadcast
        if (roomId && io) {
          const { created, deleted, updated } = syncDiskFilesToRoom(roomId);
          for (const file of created) {
            io.to(roomId).emit("file-create", { file });
          }
          for (const fileId of deleted) {
            io.to(roomId).emit("file-delete", { fileId, path: "" });
          }
          for (const file of updated) {
            io.to(roomId).emit("file-update", { file });
          }
        }
        break;
      }
    }

    const cleanProj = (roomId || "workspace").replace(/[^a-zA-Z0-9._-]/g, "_");
    const displayCwd = `/workspace/workspaces/${cleanProj}${session.relCwd ? "/" + session.relCwd : ""}`;
    const activeProc = roomId ? activeProcesses.get(roomId) : undefined;
    const isRunning = !!(activeProc && (activeProc.status === "RUNNING" || activeProc.status === "STARTING"));

    res.json({
      stdout,
      stderr,
      exitCode,
      cwd: displayCwd,
      relCwd: session.relCwd,
      detectedPort: detectedPort || activeProc?.detectedPort,
      isRunning,
      status: activeProc?.status || (exitCode === 0 ? "EXITED" : "FAILED"),
      command: activeProc?.command,
      executionTime: Date.now() - startTime,
    });
  });

  // AI Chatbot endpoint with Gemini API
  app.post("/api/chatbot", async (req: Request, res: Response) => {
    const { 
      message, 
      code, 
      language, 
      activeFileName, 
      activeFilePath, 
      files, 
      terminalOutput, 
      diagnostics 
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    try {
      const client = getAiClient();
      if (client) {
        let workspaceManifest = "";
        if (Array.isArray(files) && files.length > 0) {
          workspaceManifest = "Project Workspace Structure:\n" + 
            files.slice(0, 40).map((f: any) => `- ${f.path || f.name} (${f.language || (f.isFolder ? 'folder' : 'file')})`).join("\n") + "\n";
        }

        const prompt = `You are JARVIS, the built-in intelligent coding assistant inside CODE DEATH, an advanced real-time collaborative pair-programming Web IDE.

Workspace Context:
${workspaceManifest}
Active File: ${activeFilePath || activeFileName || "untitled"}
${language ? `Active Language: ${language}\n` : ""}
${code ? `Active File Content:\n\`\`\`${language || ""}\n${code.slice(0, 3500)}\n\`\`\`\n` : ""}
${terminalOutput ? `Recent Terminal Output / Errors:\n\`\`\`\n${terminalOutput.slice(0, 800)}\n\`\`\`\n` : ""}
${diagnostics && diagnostics.length ? `Code Diagnostics: ${JSON.stringify(diagnostics.slice(0, 5))}\n` : ""}

User Request:
${message}

Instructions:
1. You have access to the full project context above. Read and understand the existing code before answering.
2. If modifying code or fixing an error, preserve existing functionality and produce clean, ready-to-run code inside markdown code fences (\`\`\`language ... \`\`\`).
3. Explain your changes clearly and concisely.
4. Keep tone confident, helpful, and focused on clean software engineering.`;

        // Cascade of approved models according to gemini-api skill:
        // 1. gemini-3.1-flash-lite: ultra-fast, highest throughput, resilient against 503 high-demand spikes
        // 2. gemini-3.8-flash: next-gen versatile flash model
        // 3. gemini-flash-latest: standard reliable flash alias
        const candidateModels = [
          "gemini-3.1-flash-lite",
          "gemini-3.8-flash",
          "gemini-flash-latest",
        ];

        let replyText: string | null = null;
        let lastError: any = null;

        for (const model of candidateModels) {
          // Attempt with short exponential backoff if 503/429 occurs
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const response = await client.models.generateContent({
                model,
                contents: prompt,
              });
              if (response && response.text) {
                replyText = response.text;
                break;
              }
            } catch (modelErr: any) {
              lastError = modelErr;
              const errMsg = String(modelErr?.message || modelErr);
              const is503OrRateLimit =
                errMsg.includes("503") ||
                errMsg.includes("UNAVAILABLE") ||
                errMsg.includes("high demand") ||
                errMsg.includes("429");

              if (is503OrRateLimit && attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
              } else {
                break; // Try next model candidate
              }
            }
          }

          if (replyText) {
            break;
          }
        }

        if (replyText) {
          return res.json({ reply: replyText });
        }

        // If all candidate models encounter transient 503 high demand or temporary surge
        const fallbackNotice =
          "⚠️ [JARVIS Pair Assistant]: Google's Gemini models are currently experiencing temporary high demand (503 UNAVAILABLE).\n\n" +
          (language
            ? `💡 *Quick Tip for ${language}*: Ensure all imported dependencies are properly referenced, scope variables correctly, and verify syntax.`
            : "💡 *Tip*: You can continue pair-programming in real time with your team while AI capacity normalizes.");

        return res.json({ reply: fallbackNotice });
      }

      const reply = `[JARVIS Pair Assistant]: I'm here to help! For full AI code completions, set your GEMINI_API_KEY in Settings. In the meantime, you are working in ${language || "JavaScript"}. Ensure your function scopes, parameter types, and semicolons are properly formatted!`;
      res.json({ reply });
    } catch (err: any) {
      res.json({
        reply: `[JARVIS Pair Assistant]: I encountered a temporary connection issue. You can continue editing your code with your collaborators while I reconnect.`,
      });
    }
  });

  // AI Error Diagnosis & Verified Fix Endpoint
  app.post("/api/ai/fix-error", async (req: Request, res: Response) => {
    const {
      error,
      commandContext,
      code,
      language,
      activeFileName,
      activeFilePath,
      roomId,
    } = req.body;

    if (!error) {
      return res.status(400).json({ error: "Error details are required" });
    }

    try {
      const room = roomId ? rooms.get(roomId) : null;
      let workspaceFiles: string[] = [];
      if (room) {
        workspaceFiles = Array.from(room.files.values()).map((f) => `- ${f.path} (${f.language})`);
      }

      const client = getAiClient();
      if (client) {
        const prompt = `You are JARVIS, the built-in AI Debugger inside CODE DEATH IDE.
You are tasked with analyzing a real runtime error or execution failure in the user's project, pinpointing the exact file and line, and generating a verified, complete fix.

Project Workspace:
${workspaceFiles.slice(0, 30).join("\n")}

Active File: ${activeFilePath || activeFileName || "unknown"}
Language: ${language || "plaintext"}

Active File Content:
\`\`\`${language || ""}
${(code || "").slice(0, 4000)}
\`\`\`

Execution Command / Context:
${commandContext || "Command Line"}

Error Output / Traceback:
${error}

Instructions:
1. Carefully diagnose the root cause of the error.
2. Determine the exact file (e.g. "${activeFilePath || activeFileName || "main.js"}") and the line number where the fix applies.
3. Generate the COMPLETE corrected file content (not just a snippet), preserving existing code structure and style.
4. Output your response as a strictly valid JSON object with the following schema:
{
  "targetFile": "string (file path)",
  "line": number (approximate line of bug),
  "explanation": "string (concise 1-2 sentence explanation of the root cause and solution)",
  "diffSummary": "string (e.g. Added missing import / Corrected variable name)",
  "fixedCode": "string (the complete updated file content)"
}
Return ONLY the raw JSON object, without any markdown code fences or conversational text.`;

        const candidateModels = [
          "gemini-3.1-flash-lite",
          "gemini-3.8-flash",
          "gemini-flash-latest",
        ];

        let resultJson: any = null;
        for (const model of candidateModels) {
          try {
            const response = await client.models.generateContent({
              model,
              contents: prompt,
            });
            if (response && response.text) {
              const raw = response.text.trim();
              const jsonStr = raw.replace(/^```json\s*/, "").replace(/```$/, "").trim();
              resultJson = JSON.parse(jsonStr);
              break;
            }
          } catch (e) {
            // try next model
          }
        }

        if (resultJson && resultJson.fixedCode) {
          return res.json({
            targetFile: resultJson.targetFile || activeFilePath || activeFileName || "file",
            line: typeof resultJson.line === "number" ? resultJson.line : 1,
            explanation: resultJson.explanation || "Identified and corrected runtime error.",
            diffSummary: resultJson.diffSummary || "Verified fix applied.",
            fixedCode: resultJson.fixedCode,
          });
        }
      }

      // Fallback: Smart heuristic diagnostic if Gemini is busy or offline
      let targetFile = activeFilePath || activeFileName || "src/App.jsx";
      let line = 1;
      const lineMatch = error.match(/line (\d+)/i) || error.match(/:(\d+):\d+/);
      if (lineMatch) {
        line = parseInt(lineMatch[1], 10);
      }

      let explanation = "Detected runtime issue from execution output.";
      if (error.includes("is not defined") || error.includes("NameError")) {
        explanation = "Variable or function is referenced before declaration or missing import.";
      } else if (error.includes("SyntaxError")) {
        explanation = "Syntax error detected in the code structure or missing punctuation.";
      } else if (error.includes("Cannot find module") || error.includes("ModuleNotFoundError")) {
        explanation = "Missing module dependency or incorrect relative import path.";
      }

      res.json({
        targetFile,
        line,
        explanation: `${explanation} (AI offline mode: review line ${line})`,
        diffSummary: "Automated stack trace analysis completed.",
        fixedCode: code || "",
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to process AI error fix: " + err.message });
    }
  });

  // Global payload and error handler
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err && (err.type === "entity.too.large" || err.status === 413 || err.name === "PayloadTooLargeError")) {
      return res.status(413).json({
        error: "Payload too large",
        message: "The imported project payload exceeds the server limit (50MB). Please exclude large build folders or binary files.",
      });
    }
    next(err);
  });

  // Dev Server Asset Interceptor:
  // If a request originates from an active preview frame (via referer or preview cookie),
  // route it to the active project dev server port so it NEVER hits CODE DEATH's Vite instance!
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Skip if already in /api/
    if (req.path.startsWith("/api/")) {
      return next();
    }

    let targetPort: number | null = null;
    const referer = (req.headers.referer as string) || "";
    const refMatch = referer.match(/\/api\/preview\/(\d+)/);
    if (refMatch && refMatch[1]) {
      targetPort = parseInt(refMatch[1], 10);
    } else if (req.headers.cookie) {
      const cookieMatch = (req.headers.cookie as string).match(/\bcd_preview_port=(\d+)/);
      if (cookieMatch && cookieMatch[1]) {
        const isTopLevelIde = req.path === "/" || req.path.startsWith("/room/") || req.path.startsWith("/login");
        if (!isTopLevelIde) {
          targetPort = parseInt(cookieMatch[1], 10);
        }
      }
    }

    if (targetPort && !RESERVED_PORTS.has(targetPort)) {
      return proxyRequestToDevServer(req, res, targetPort, req.originalUrl);
    }

    next();
  });

  // Vite Middleware Setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // WebSocket upgrade handler for child dev servers (Vite HMR, WS connections)
  server.on("upgrade", (req, socket, head) => {
    if (req.url && req.url.startsWith("/socket.io/")) {
      return;
    }

    let targetPort: number | null = null;
    const referer = (req.headers.referer as string) || "";
    const refMatch = referer.match(/\/api\/preview\/(\d+)/);
    if (refMatch && refMatch[1]) {
      targetPort = parseInt(refMatch[1], 10);
    } else if (req.headers.cookie) {
      const cookieMatch = (req.headers.cookie as string).match(/\bcd_preview_port=(\d+)/);
      if (cookieMatch && cookieMatch[1]) {
        targetPort = parseInt(cookieMatch[1], 10);
      }
    }

    if (targetPort && !RESERVED_PORTS.has(targetPort)) {
      import("net").then((net) => {
        const client = net.connect(targetPort!, "127.0.0.1", () => {
          client.write(
            `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
            Object.entries(req.headers)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}\r\n`)
              .join("") +
            "\r\n"
          );
          if (head && head.length) client.write(head);
          client.pipe(socket);
          socket.pipe(client);
        });
        client.on("error", () => socket.destroy());
        socket.on("error", () => client.destroy());
      });
      return;
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`⚡ CODE DEATH Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
