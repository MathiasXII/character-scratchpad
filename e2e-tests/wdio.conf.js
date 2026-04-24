import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const appBinary = process.platform === 'win32'
  ? path.resolve(projectRoot, 'src-tauri/target/debug/llm-chat.exe')
  : path.resolve(projectRoot, 'src-tauri/target/debug/llm-chat');

let tauriDriverProcess;

export const config = {
  runner: 'local',
  specs: ['./specs/**/*.e2e.js'],
  maxInstances: 1,
  logLevel: 'info',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 1,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
  hostname: '127.0.0.1',
  port: 4444,
  path: '/',
  capabilities: [{
    browserName: 'wry',
    'tauri:options': {
      application: appBinary,
    },
  }],
  onPrepare: () => {
    const result = spawnSync('npm', ['run', 'build:app'], {
      cwd: __dirname,
      stdio: 'inherit',
      shell: true,
      timeout: 120000,
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(`App build failed with exit code ${result.status ?? 'unknown'}`);
    }
  },
  beforeSession: () => {
    tauriDriverProcess = spawn('tauri-driver', ['--port', '4444'], {
      stdio: 'inherit',
      shell: true,
    });
  },
  afterSession: () => {
    if (tauriDriverProcess && !tauriDriverProcess.killed) {
      tauriDriverProcess.kill();
    }
  },
};
