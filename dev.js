import { spawn, execSync } from 'child_process';
import os from 'os';

const isWin = os.platform() === 'win32';
const pythonCmd = isWin ? 'python' : 'python3';
const pipCmd = isWin ? 'pip' : 'pip3';

try {
  // Specifically for Linux (AI studio) without pip3
  if (!isWin) {
    try {
      execSync('command -v pip3', { stdio: 'ignore' });
    } catch {
      console.log('pip3 not found, installing via get-pip.py...');
      execSync('curl -sS https://bootstrap.pypa.io/get-pip.py | python3', { stdio: 'inherit' });
    }
  }
  
  console.log('Installing Python dependencies...');
  try {
    execSync(`${pythonCmd} -m pip install -q -r backend/requirements.txt`, { stdio: 'inherit' });
    console.log('Installing Playwright Chromium...');
    execSync(`${pythonCmd} -m playwright install chromium`, { stdio: 'inherit' });
  } catch (pipErr) {
    console.log('Note: Failed to install Python dependencies automatically. If backend fails, please install them manually.');
  }
} catch (e) {
  console.log('Dependency check output:', e.message);
}

const npxCmd = isWin ? 'npx.cmd' : 'npx';

const commandArgs = isWin ? ['/c', pythonCmd, 'backend/main.py'] : ['backend/main.py'];
const actualCmd = isWin ? 'cmd.exe' : pythonCmd;

const backend = spawn(actualCmd, commandArgs, { 
  stdio: 'inherit',
  shell: false 
});

const viteArgs = isWin ? ['/c', npxCmd, 'vite', '--port=3000', '--host=0.0.0.0'] : ['vite', '--port=3000', '--host=0.0.0.0'];
const actualViteCmd = isWin ? 'cmd.exe' : npxCmd;

const frontend = spawn(actualViteCmd, viteArgs, { 
  stdio: 'inherit',
  shell: false
});

// Handle graceful shutdown
let isShuttingDown = false;
const cleanup = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  if (isWin) {
    try {
      if (backend.pid) execSync(`taskkill /pid ${backend.pid} /t /f`, { stdio: 'ignore' });
    } catch(e) {}
    try {
      if (frontend.pid) execSync(`taskkill /pid ${frontend.pid} /t /f`, { stdio: 'ignore' });
    } catch(e) {}
  } else {
    backend.kill('SIGTERM');
    frontend.kill('SIGTERM');
  }
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
