const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { spawn, exec, execSync, execFile } = require('child_process');

app.setName('SADARAKSHAK');

let mainWindow = null;
let isQuitting = false;

// -----------------------------------------------------------------------------
// Path Resolution
// -----------------------------------------------------------------------------
function getPaths() {
  const isDev = !app.isPackaged;
  const rootDir = isDev
    ? path.join(__dirname, '..')
    : path.dirname(process.resourcesPath);

  const backendDir = !isDev && fs.existsSync(path.join(process.resourcesPath, 'backend'))
    ? path.join(process.resourcesPath, 'backend')
    : path.join(rootDir, 'backend');

  // Frontend dist resolution:
  // 1. Inside app.asar (packaged) or desktop/frontend/dist (synced)
  // 2. ../frontend/dist (dev workspace)
  // 3. process.resourcesPath/frontend/dist
  let frontendDist = path.join(__dirname, 'frontend', 'dist');
  if (!fs.existsSync(path.join(frontendDist, 'index.html'))) {
    const alt1 = path.join(rootDir, 'frontend', 'dist');
    if (fs.existsSync(path.join(alt1, 'index.html'))) {
      frontendDist = alt1;
    } else {
      const alt2 = path.join(process.resourcesPath, 'frontend', 'dist');
      if (fs.existsSync(path.join(alt2, 'index.html'))) {
        frontendDist = alt2;
      }
    }
  }

  const userDataDir = app.getPath('userData');
  const dataDir = path.join(userDataDir, 'data');
  const detectedAccidentsDir = path.join(userDataDir, 'detected_accidents');
  const uploadsDir = path.join(userDataDir, 'uploads');
  const accidentClipsDir = path.join(userDataDir, 'accident_clips');
  const accidentImagesDir = path.join(userDataDir, 'accident_images');
  const logsDir = path.join(userDataDir, 'logs');
  const userVenvDir = path.join(userDataDir, 'venv');
  const logFile = path.join(logsDir, 'backend.log');

  for (const dir of [dataDir, detectedAccidentsDir, uploadsDir, accidentClipsDir, accidentImagesDir, logsDir]) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {
        console.error('Failed to create directory:', dir, e);
      }
    }
  }

  // Seed sample clip into accident_clips if empty
  try {
    const existingClips = fs.readdirSync(accidentClipsDir);
    if (existingClips.length === 0) {
      const bundledSample = path.join(backendDir, 'accident_clips', 'accident.mp4');
      if (fs.existsSync(bundledSample)) {
        fs.copyFileSync(bundledSample, path.join(accidentClipsDir, 'accident.mp4'));
        console.log('[Desktop] Seeded sample accident clip to user directory.');
      }
    }
  } catch (e) {
    // Non-fatal
  }

  // Model path
  let modelPath = path.join(backendDir, 'model', 'best.pt');
  if (!fs.existsSync(modelPath) && !isDev) {
    const altModel = path.join(process.resourcesPath, 'backend', 'model', 'best.pt');
    if (fs.existsSync(altModel)) modelPath = altModel;
  }

  return {
    isDev,
    rootDir,
    backendDir,
    frontendDist,
    userDataDir,
    dataDir,
    detectedAccidentsDir,
    uploadsDir,
    accidentClipsDir,
    accidentImagesDir,
    logsDir,
    userVenvDir,
    logFile,
    modelPath,
  };
}

// -----------------------------------------------------------------------------
// Logging Helper (with sensitive credential masking)
// -----------------------------------------------------------------------------
function maskCredentials(str) {
  if (typeof str !== 'string') return String(str);
  return str.replace(/((?:rtsps?|https?|rtmp):\/\/[^:%/@\s]+:)[^@\s]+(@)/gi, '$1***$2');
}

class BackendLogger {
  constructor(filePath) {
    this.filePath = filePath;
    this.stream = null;
    this._initStream();
  }

  _initStream() {
    try {
      this.stream = fs.createWriteStream(this.filePath, { flags: 'a' });
    } catch (e) {
      console.error('Failed to initialize backend log stream:', e);
    }
  }

  write(message, prefix = '') {
    const masked = maskCredentials(message);
    const line = prefix ? `[${new Date().toISOString()}] ${prefix} ${masked}\n` : masked;
    if (this.stream) {
      try {
        this.stream.write(line);
      } catch (e) {}
    }
    console.log(line.trim());
  }

  section(title) {
    const divider = '='.repeat(60);
    this.write(`\n${divider}\n ${title} [${new Date().toISOString()}]\n${divider}\n`);
  }
}

// -----------------------------------------------------------------------------
// Port Conflict & Health Probe Utilities
// -----------------------------------------------------------------------------
function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    // 1. First probe by connecting: if connection succeeds, a service is actively listening
    const client = net.createConnection({ port, host, timeout: 600 });
    let settled = false;

    const done = (inUse) => {
      if (!settled) {
        settled = true;
        resolve(inUse);
      }
    };

    client.once('connect', () => {
      client.destroy();
      done(true);
    });

    const tryListen = () => {
      // 2. If connect failed, verify if port can be bound
      try {
        const tester = net.createServer()
          .once('error', (err) => {
            done(err.code === 'EADDRINUSE');
          })
          .once('listening', () => {
            tester.once('close', () => done(false)).close();
          })
          .listen(port, host);
      } catch (e) {
        done(true);
      }
    };

    client.once('timeout', () => {
      client.destroy();
      tryListen();
    });

    client.once('error', () => {
      tryListen();
    });
  });
}

function probeSadarakshakHealth(port, host = '127.0.0.1', timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/health`, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            if (data.status === 'ok' && data.app === 'SADARAKSHAK') {
              resolve({ ok: true, data });
              return;
            }
          } catch (e) {}
        }
        resolve({ ok: false, conflict: true, statusCode: res.statusCode });
      });
    });

    req.on('error', () => resolve({ ok: false, conflict: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, conflict: false });
    });
  });
}

async function resolveBackendPort(preferredPort = 8000, host = '127.0.0.1') {
  // 1. Is preferred port free?
  const inUse = await isPortInUse(preferredPort, host);
  if (!inUse) {
    return { port: preferredPort, isConflict: false, alreadyRunning: false };
  }

  // 2. If in use, is it an already running SADARAKSHAK backend?
  const health = await probeSadarakshakHealth(preferredPort, host, 1500);
  if (health.ok) {
    return { port: preferredPort, isConflict: false, alreadyRunning: true, healthData: health.data };
  }

  // 3. Port is occupied by an unrelated third-party service!
  // Find next available free port in 8001..8050
  for (let candidate = preferredPort + 1; candidate <= preferredPort + 50; candidate++) {
    const candidateInUse = await isPortInUse(candidate, host);
    if (!candidateInUse) {
      return { port: candidate, isConflict: true, originalPort: preferredPort, alreadyRunning: false };
    }
  }

  throw new Error(`Unable to find a free port between ${preferredPort} and ${preferredPort + 50}.`);
}

// -----------------------------------------------------------------------------
// Python Runtime Discovery & Verification Manager
// -----------------------------------------------------------------------------
class RuntimeManager {
  constructor(paths, logger) {
    this.paths = paths;
    this.logger = logger;
  }

  /**
   * Search for all candidate Python interpreters on the workstation.
   */
  getCandidates() {
    const c = [];

    // 1. Packaged standalone backend.exe
    c.push({ path: path.join(this.paths.backendDir, 'backend.exe'), isExe: true });
    if (!this.paths.isDev) {
      c.push({ path: path.join(process.resourcesPath, 'backend', 'backend.exe'), isExe: true });
    }

    // 2. User AppData isolated virtual environment
    c.push({ path: path.join(this.paths.userVenvDir, 'Scripts', 'python.exe'), isVenv: true });
    if (process.env.LOCALAPPDATA) {
      c.push({ path: path.join(process.env.LOCALAPPDATA, 'SADARAKSHAK', 'venv', 'Scripts', 'python.exe'), isVenv: true });
    }

    // 3. Bundled or developer virtual environment
    c.push({ path: path.join(this.paths.backendDir, 'venv', 'Scripts', 'python.exe'), isVenv: true });
    if (this.paths.isDev) {
      c.push({ path: path.join(this.paths.rootDir, 'backend', 'venv', 'Scripts', 'python.exe'), isVenv: true });
    }

    // 4. Standard Python installations
    const standardDirs = [
      'C:\\Python314\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python310\\python.exe',
    ];
    for (const s of standardDirs) {
      c.push({ path: s, isSystem: true });
    }

    // 5. LocalAppData Programs Python
    if (process.env.LOCALAPPDATA) {
      for (const ver of ['Python314', 'Python312', 'Python311', 'Python310', 'Python313']) {
        c.push({ path: path.join(process.env.LOCALAPPDATA, 'Programs', 'Python', ver, 'python.exe'), isSystem: true });
      }
    }

    // 6. Py launcher / where.exe candidates
    try {
      const whereOut = execSync('where.exe python', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      for (const line of whereOut.split(/\r?\n/)) {
        const trimmed = line.trim();
        // Ignore WindowsApps execution alias (Microsoft Store stub)
        if (trimmed && !trimmed.toLowerCase().includes('windowsapps')) {
          c.push({ path: trimmed, isSystem: true });
        }
      }
    } catch (e) {}

    // Filter existing and deduplicate
    const seen = new Set();
    const result = [];
    for (const item of c) {
      const normalized = path.normalize(item.path);
      if (!seen.has(normalized.toLowerCase()) && fs.existsSync(normalized)) {
        seen.add(normalized.toLowerCase());
        result.push({ ...item, path: normalized });
      }
    }

    return result;
  }

  /**
   * Fast verification test: checks if Python can import required libraries.
   */
  testEnvironment(pythonPath) {
    return new Promise((resolve) => {
      const testCode = 'import fastapi, uvicorn, torch, ultralytics; print("SADARAKSHAK_READY")';
      execFile(pythonPath, ['-c', testCode], { timeout: 15000 }, (error, stdout, stderr) => {
        const output = (stdout || '') + (stderr || '');
        if (!error && output.includes('SADARAKSHAK_READY')) {
          resolve({ ready: true, output });
          return;
        }

        // Check for Windows Application Control WinError 4551
        if (output.includes('4551') || output.toLowerCase().includes('application control policy has blocked this file')) {
          resolve({ ready: false, winError4551: true, output });
          return;
        }

        resolve({ ready: false, output });
      });
    });
  }

  /**
   * Discover ready runtime or select base interpreter for automated bootstrapping.
   */
  async resolveRuntime(progressCallback) {
    const candidates = this.getCandidates();
    this.logger.write(`Discovered ${candidates.length} Python / executable candidate(s).`, '[Runtime]');

    let basePythonForVenv = null;

    // Check each candidate
    for (const c of candidates) {
      this.logger.write(`Inspecting candidate: ${c.path}`, '[Runtime]');

      if (c.isExe) {
        return { type: 'exe', executable: c.path };
      }

      const test = await this.testEnvironment(c.path);
      if (test.ready) {
        this.logger.write(`Candidate verified successfully: ${c.path}`, '[Runtime]');
        return { type: 'python', executable: c.path, isVenv: Boolean(c.isVenv) };
      }

      if (test.winError4551) {
        this.logger.write(`WinError 4551 detected on candidate: ${c.path}\n${test.output}`, '[Runtime]');
        return {
          error: 'WINERROR_4551',
          executable: c.path,
          details: test.output,
        };
      }

      if (!basePythonForVenv && c.isSystem) {
        basePythonForVenv = c.path;
      }
    }

    // If no candidate has all packages, but we found a valid base Python:
    if (basePythonForVenv) {
      this.logger.write(`No fully configured venv found. Bootstrapping user venv using base: ${basePythonForVenv}`, '[Runtime]');
      return {
        needsBootstrap: true,
        basePython: basePythonForVenv,
        targetVenv: this.paths.userVenvDir,
      };
    }

    return {
      error: 'NO_PYTHON_FOUND',
      details: 'No compatible Python 64-bit environment found on this system.',
    };
  }

  /**
   * Automatically bootstrap virtualenv in user AppData.
   */
  async bootstrapUserVenv(basePython, targetVenv, progressCallback) {
    this.logger.write(`Creating isolated venv at: ${targetVenv}`, '[Bootstrap]');
    if (progressCallback) progressCallback('Creating isolated AI environment (one-time setup)...');

    const venvPython = path.join(targetVenv, 'Scripts', 'python.exe');

    // 1. Create venv
    await new Promise((resolve, reject) => {
      exec(`"${basePython}" -m venv "${targetVenv}"`, (err, stdout, stderr) => {
        if (err) {
          this.logger.write(`venv creation failed: ${stderr || err.message}`, '[Bootstrap]');
          reject(new Error(`Failed to create virtual environment: ${stderr || err.message}`));
        } else {
          resolve();
        }
      });
    });

    // 2. Install requirements
    const reqPath = path.join(this.paths.backendDir, 'requirements.txt');
    if (!fs.existsSync(reqPath)) {
      throw new Error(`requirements.txt not found at ${reqPath}`);
    }

    if (progressCallback) progressCallback('Installing PyTorch, YOLO11, and backend packages...');
    this.logger.write(`Installing dependencies from ${reqPath}...`, '[Bootstrap]');

    await new Promise((resolve, reject) => {
      const child = spawn(`"${venvPython}"`, ['-m', 'pip', 'install', '-r', `"${reqPath}"`], {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (d) => {
        const text = d.toString().trim();
        if (text) this.logger.write(text, '[pip]');
      });
      child.stderr.on('data', (d) => {
        const text = d.toString().trim();
        if (text) this.logger.write(text, '[pip-err]');
      });

      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`pip install exited with code ${code}`));
      });
    });

    // 3. Test final venv
    const verify = await this.testEnvironment(venvPython);
    if (!verify.ready) {
      if (verify.winError4551) {
        throw new Error(`Windows Application Control policy blocked PyTorch DLL (WinError 4551).`);
      }
      throw new Error(`Verification of installed environment failed: ${verify.output}`);
    }

    return venvPython;
  }
}

// -----------------------------------------------------------------------------
// Backend Process Manager Class
// -----------------------------------------------------------------------------
class BackendManager {
  constructor() {
    this.paths = getPaths();
    this.logger = new BackendLogger(this.paths.logFile);
    this.runtimeManager = new RuntimeManager(this.paths, this.logger);

    this.process = null;
    this.pid = null;
    this.port = 8000;
    this.url = 'http://127.0.0.1:8000';
    this.status = 'stopped'; // 'stopped' | 'starting' | 'ready' | 'error'
    this.isManaged = false;
    this.runtimeInfo = null;
    this.yoloReady = false;
    this.lastHealthData = null;
    this.crashRetries = 0;
    this.maxCrashRetries = 3;
    this.lastError = null;
  }

  notifyStatus(step, message, extra = {}) {
    this.logger.write(`[${step}] ${message}`, '[Status]');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-status', {
        step,
        message,
        port: this.port,
        url: this.url,
        status: this.status,
        ...extra,
      });

      // Update splash page DOM if splash is loaded
      mainWindow.webContents.executeJavaScript(`
        if (typeof window.updateSplashStatus === 'function') {
          window.updateSplashStatus(${JSON.stringify(step)}, ${JSON.stringify(message)});
        }
      `).catch(() => {});
    }
  }

  async start() {
    this.logger.section('SADARAKSHAK Backend Initialization');
    this.status = 'starting';
    this.lastError = null;

    try {
      // Step 1: Port conflict resolution & existing instance check
      this.notifyStatus('CHECK_PORT', 'Checking network port and backend status...');
      const portInfo = await resolveBackendPort(8000);
      this.port = portInfo.port;
      this.url = `http://127.0.0.1:${this.port}`;

      if (portInfo.alreadyRunning) {
        this.logger.write(`Reusing verified running SADARAKSHAK backend on port ${this.port}`, '[Desktop]');
        this.status = 'ready';
        this.isManaged = false;
        this.yoloReady = true;
        this.lastHealthData = portInfo.healthData;
        this.notifyStatus('READY', 'Connected to active SADARAKSHAK backend.');
        return true;
      }

      if (portInfo.isConflict) {
        this.logger.write(
          `Port ${portInfo.originalPort} occupied by unrelated application. SADARAKSHAK will use port ${this.port}.`,
          '[Conflict]'
        );
      }

      // Step 2: Runtime discovery
      this.notifyStatus('DISCOVER_RUNTIME', 'Locating Python AI runtime and YOLO11 model...');
      const runtimeResult = await this.runtimeManager.resolveRuntime((msg) => {
        this.notifyStatus('CONFIGURING', msg);
      });

      if (runtimeResult.error) {
        this.status = 'error';
        this.lastError = runtimeResult;
        this.notifyStatus('ERROR', runtimeResult.details || runtimeResult.error, { error: runtimeResult });
        return false;
      }

      let executable = runtimeResult.executable;
      let isStandaloneExe = runtimeResult.type === 'exe';

      if (runtimeResult.needsBootstrap) {
        this.notifyStatus('BOOTSTRAP', 'Setting up isolated Python environment (one-time setup)...');
        executable = await this.runtimeManager.bootstrapUserVenv(
          runtimeResult.basePython,
          runtimeResult.targetVenv,
          (msg) => this.notifyStatus('INSTALLING', msg)
        );
        isStandaloneExe = false;
      }

      this.runtimeInfo = { executable, isStandaloneExe };
      this.logger.write(`Selected backend launcher: ${executable}`, '[Spawn]');

      // Step 3: Spawn backend process
      this.notifyStatus('START_PROCESS', 'Starting FastAPI & AI detection engine...');

      const env = {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONPATH: this.paths.backendDir,
        PORT: String(this.port),
        SADARAKSHAK_DATA_DIR: this.paths.dataDir,
        SADARAKSHAK_DETECTED_ACCIDENTS_DIR: this.paths.detectedAccidentsDir,
        SADARAKSHAK_UPLOADS_DIR: this.paths.uploadsDir,
        SADARAKSHAK_ACCIDENT_CLIPS_DIR: this.paths.accidentClipsDir,
        SADARAKSHAK_ACCIDENT_IMAGES_DIR: this.paths.accidentImagesDir,
        SADARAKSHAK_MODEL_PATH: this.paths.modelPath,
      };

      const spawnCmd = executable;
      const spawnArgs = isStandaloneExe
        ? ['--port', String(this.port)]
        : ['app.py', '--port', String(this.port)];

      this.logger.write(`Spawning: ${spawnCmd} ${spawnArgs.join(' ')} (cwd: ${this.paths.backendDir})`, '[Spawn]');

      this.process = spawn(spawnCmd, spawnArgs, {
        cwd: this.paths.backendDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      });

      this.pid = this.process.pid;
      this.isManaged = true;
      this.logger.write(`Backend process spawned with PID: ${this.pid}`, '[Spawn]');

      this.process.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        this.logger.write(text);
        if (text.includes('Model loaded:')) {
          this.notifyStatus('MODEL_LOADED', 'YOLO11 neural model loaded into memory.');
        }
      });

      this.process.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        this.logger.write(text, '[STDERR]');
      });

      this.process.on('exit', (code, signal) => {
        this.logger.write(`Backend process exited with code ${code}, signal ${signal}`, '[Exit]');
        const wasManaged = this.isManaged;
        this.process = null;
        this.pid = null;

        if (!isQuitting && wasManaged) {
          this.handleUnexpectedExit(code, signal);
        }
      });

      this.process.on('error', (err) => {
        this.logger.write(`Backend process spawn error: ${err.message}`, '[Error]');
      });

      // Step 4: Health check polling
      this.notifyStatus('HEALTH_POLL', 'Waiting for AI engine health verification...');
      const healthy = await this.pollHealthCheck(45000);

      if (healthy) {
        this.status = 'ready';
        this.crashRetries = 0;
        this.yoloReady = true;
        this.notifyStatus('READY', 'SADARAKSHAK backend and YOLO11 are ready!');
        return true;
      } else {
        this.status = 'error';
        this.lastError = {
          error: 'HEALTH_TIMEOUT',
          details: `The backend did not become ready on ${this.url} within 45 seconds. Check backend.log.`,
        };
        this.notifyStatus('ERROR', this.lastError.details);
        return false;
      }
    } catch (err) {
      this.logger.write(`Fatal exception during backend start: ${err.stack || err.message}`, '[Fatal]');
      this.status = 'error';
      this.lastError = { error: 'EXCEPTION', details: err.message };
      this.notifyStatus('ERROR', err.message);
      return false;
    }
  }

  async pollHealthCheck(timeoutMs = 45000) {
    const start = Date.now();
    let attempt = 0;

    while (Date.now() - start < timeoutMs) {
      attempt++;
      await new Promise((r) => setTimeout(r, 600));

      const probe = await probeSadarakshakHealth(this.port, '127.0.0.1', 1500);
      if (probe.ok) {
        this.lastHealthData = probe.data;
        this.logger.write(`Backend healthy after ${Date.now() - start}ms (attempt ${attempt}).`, '[Health]');
        return true;
      }

      // If the process already died, don't keep polling
      if (this.isManaged && !this.process) {
        this.logger.write('Backend process exited prematurely during startup.', '[Health]');
        return false;
      }
    }

    return false;
  }

  handleUnexpectedExit(code, signal) {
    if (this.crashRetries < this.maxCrashRetries) {
      this.crashRetries++;
      this.logger.write(
        `Attempting automatic recovery (retry ${this.crashRetries}/${this.maxCrashRetries})...`,
        '[Recovery]'
      );
      this.notifyStatus('RECOVERING', `Backend disconnected. Reconnecting (attempt ${this.crashRetries})...`);

      setTimeout(() => {
        if (!isQuitting) {
          this.start().then((ok) => {
            if (ok && mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('backend-recovered', { url: this.url, port: this.port });
            }
          });
        }
      }, 2500);
    } else {
      this.status = 'error';
      this.lastError = {
        error: 'CRASH_LIMIT_REACHED',
        details: `Backend process exited with code ${code}. Maximum restart attempts reached.`,
      };
      this.notifyStatus('CRASHED', this.lastError.details);
    }
  }

  stop() {
    if (this.process && this.pid) {
      const targetPid = this.pid;
      this.logger.write(`Stopping SADARAKSHAK backend process tree (PID ${targetPid})...`, '[Shutdown]');
      this.isManaged = false;
      this.process = null;
      this.pid = null;

      try {
        // Kill process and entire child process tree on Windows
        exec(`taskkill /PID ${targetPid} /T /F`, (err) => {
          if (err) this.logger.write(`Taskkill result: ${err.message}`, '[Shutdown]');
        });
      } catch (e) {
        this.logger.write(`Error during taskkill: ${e.message}`, '[Shutdown]');
      }
    }
    this.status = 'stopped';
  }

  getInfo() {
    return {
      status: this.status,
      port: this.port,
      url: this.url,
      pid: this.pid,
      isManaged: this.isManaged,
      yoloReady: this.yoloReady,
      logFile: this.paths.logFile,
      userDataDir: this.paths.userDataDir,
      detectedAccidentsDir: this.paths.detectedAccidentsDir,
      dataDir: this.paths.dataDir,
      accidentClipsDir: this.paths.accidentClipsDir,
      lastHealthData: this.lastHealthData,
      lastError: this.lastError,
    };
  }
}

const backendManager = new BackendManager();

// -----------------------------------------------------------------------------
// UI Screen Templates (Splash & Error)
// -----------------------------------------------------------------------------
function getSplashHtml() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>SADARAKSHAK</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #090d16;
          color: #e2e8f0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          user-select: none;
          overflow: hidden;
        }
        .container {
          text-align: center;
          max-width: 440px;
          padding: 36px 30px;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 24px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(6, 182, 212, 0.15);
        }
        .logo {
          width: 68px;
          height: 68px;
          margin-bottom: 20px;
          border-radius: 18px;
          background: linear-gradient(135deg, #ef4444 0%, #06b6d4 100%);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 25px -5px rgba(6, 182, 212, 0.4);
        }
        .logo svg { width: 38px; height: 38px; fill: white; }
        h1 {
          font-size: 24px;
          margin: 0 0 6px 0;
          letter-spacing: -0.5px;
          font-weight: 800;
          background: linear-gradient(to right, #ffffff, #38bdf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        p {
          font-size: 13px;
          color: #94a3b8;
          margin: 0 0 24px 0;
        }
        .spinner {
          width: 26px;
          height: 26px;
          border: 3px solid rgba(6, 182, 212, 0.2);
          border-top-color: #06b6d4;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 16px auto;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status-box {
          background: rgba(2, 6, 23, 0.6);
          border: 1px solid rgba(56, 189, 248, 0.25);
          padding: 10px 16px;
          border-radius: 12px;
          display: inline-block;
          max-width: 100%;
        }
        .status {
          font-size: 12.5px;
          color: #38bdf8;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .steps {
          margin-top: 18px;
          display: flex;
          justify-content: center;
          gap: 6px;
        }
        .step-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(148, 163, 184, 0.3);
          transition: background 0.3s;
        }
        .step-dot.active { background: #06b6d4; box-shadow: 0 0 8px #06b6d4; }
        .step-dot.done { background: #10b981; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <h1>SADARAKSHAK</h1>
        <p>Road Accident Monitoring & AI Detection System</p>
        <div class="spinner"></div>
        <div class="status-box">
          <div class="status" id="status-text">Initializing SADARAKSHAK...</div>
        </div>
        <div class="steps">
          <div class="step-dot active" id="dot-1"></div>
          <div class="step-dot" id="dot-2"></div>
          <div class="step-dot" id="dot-3"></div>
          <div class="step-dot" id="dot-4"></div>
        </div>
      </div>
      <script>
        window.updateSplashStatus = function(step, message) {
          const el = document.getElementById('status-text');
          if (el) el.innerText = message;
          const dots = [document.getElementById('dot-1'), document.getElementById('dot-2'), document.getElementById('dot-3'), document.getElementById('dot-4')];
          const map = { 'CHECK_PORT': 0, 'DISCOVER_RUNTIME': 1, 'START_PROCESS': 2, 'HEALTH_POLL': 3, 'READY': 4 };
          const idx = map[step] ?? 1;
          dots.forEach((d, i) => {
            if (!d) return;
            if (i < idx) { d.className = 'step-dot done'; }
            else if (i === idx) { d.className = 'step-dot active'; }
            else { d.className = 'step-dot'; }
          });
        };
      </script>
    </body>
    </html>
  `;
}

function getErrorHtml(title, message, details, logFile) {
  const isWdac = details && (details.includes('4551') || details.toLowerCase().includes('application control policy'));
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>SADARAKSHAK - Initialization Diagnostic</title>
      <style>
        body {
          margin: 0;
          background: #090d16;
          color: #e2e8f0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          padding: 24px;
        }
        .card {
          background: #111a28;
          border: 1px solid #ef4444;
          border-radius: 18px;
          max-width: 580px;
          width: 100%;
          padding: 32px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.6);
        }
        h2 {
          color: #f87171;
          margin: 0 0 10px 0;
          font-size: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        p {
          font-size: 13.5px;
          color: #cbd5e1;
          line-height: 1.6;
          margin: 0 0 16px 0;
        }
        .advisory {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 10px;
          padding: 12px;
          font-size: 12.5px;
          color: #fca5a5;
          margin-bottom: 16px;
        }
        pre {
          background: #090d16;
          border: 1px solid #1e293b;
          padding: 12px;
          border-radius: 10px;
          font-size: 11.5px;
          color: #94a3b8;
          overflow-x: auto;
          max-height: 140px;
          font-family: monospace;
          margin-bottom: 20px;
        }
        .actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .btn {
          background: #06b6d4;
          color: white;
          border: none;
          padding: 10px 18px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn:hover { background: #0891b2; }
        .btn-secondary {
          background: #1e293b;
          color: #cbd5e1;
          border: 1px solid #334155;
        }
        .btn-secondary:hover { background: #334155; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>
          <svg style="width:24px;height:24px;fill:#ef4444" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          ${title}
        </h2>
        <p>${message}</p>
        ${
          isWdac
            ? `<div class="advisory">
                <strong>Windows Security Policy Advisory (WinError 4551):</strong><br>
                Windows Application Control (WDAC / AppLocker) blocked execution of the PyTorch DLL (e.g. torch_python.dll).
                To resolve, ensure this application is run in an approved directory with authorized execution privileges.
              </div>`
            : ''
        }
        <pre>${details || 'Log path: ' + logFile}</pre>
        <div class="actions">
          <button class="btn" onclick="retry()">Retry Startup</button>
          <button class="btn btn-secondary" onclick="openLog()">Open Backend Log</button>
        </div>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        function retry() { location.reload(); }
        function openLog() { ipcRenderer.invoke('open-log-file'); }
      </script>
    </body>
    </html>
  `;
}

// -----------------------------------------------------------------------------
// Electron Window Creation & App Lifecycle
// -----------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#090d16',
    title: 'SADARAKSHAK — Road Accident Monitoring & AI Detection System',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.removeMenu();

  // Show splash while backend warms up
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getSplashHtml())}`);

  // Open external links in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initializeApp() {
  createWindow();

  const paths = backendManager.paths;
  backendManager.logger.write(`SADARAKSHAK Desktop v1.0.0 starting`, '[App]');
  backendManager.logger.write(`App Data Directory: ${paths.userDataDir}`, '[App]');
  backendManager.logger.write(`Backend Directory: ${paths.backendDir}`, '[App]');

  const backendOk = await backendManager.start();

  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (!backendOk) {
    const info = backendManager.getInfo();
    mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        getErrorHtml(
          'Backend Engine Could Not Start',
          info.lastError?.details || 'The AI detection service could not become ready on ' + backendManager.url,
          info.lastError?.details || JSON.stringify(info.lastError),
          paths.logFile
        )
      )}`
    );
    return;
  }

  // Load frontend once backend is healthy
  const indexPath = path.join(paths.frontendDist, 'index.html');
  if (fs.existsSync(indexPath)) {
    backendManager.logger.write(`Loading packaged frontend from: ${indexPath}`, '[App]');
    mainWindow.loadFile(indexPath);
  } else {
    backendManager.logger.write('Dist not found, attempting dev server at http://localhost:5173...', '[App]');
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          getErrorHtml(
            'Frontend Assets Missing',
            'Frontend dist folder not found. Please run npm run build in the frontend directory.',
            indexPath,
            paths.logFile
          )
        )}`
      );
    });
  }
}

app.whenReady().then(() => {
  initializeApp();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      initializeApp();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  backendManager.stop();
});

app.on('window-all-closed', () => {
  backendManager.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// -----------------------------------------------------------------------------
// IPC Handlers
// -----------------------------------------------------------------------------
ipcMain.on('get-backend-info-sync', (event) => {
  event.returnValue = backendManager.getInfo();
});

ipcMain.handle('get-backend-info', () => {
  return backendManager.getInfo();
});

ipcMain.handle('get-app-paths', () => {
  return backendManager.paths;
});

ipcMain.handle('open-log-file', () => {
  if (fs.existsSync(backendManager.paths.logFile)) {
    shell.openPath(backendManager.paths.logFile);
  }
});

ipcMain.handle('open-folder', (_event, folderPath) => {
  const target = folderPath || backendManager.paths.userDataDir;
  if (fs.existsSync(target)) {
    shell.openPath(target);
  }
});

ipcMain.handle('open-external', (_event, url) => {
  if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
    shell.openExternal(url);
  }
});

ipcMain.handle('restart-backend', async () => {
  backendManager.stop();
  return await backendManager.start();
});
