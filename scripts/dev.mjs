// Runs the API and web dev servers together (cross-platform; `&` does not work in Windows cmd).
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = ['server', 'web'].map((ws) =>
  spawn(npm, ['run', 'dev', '--workspace', ws], { stdio: 'inherit', shell: process.platform === 'win32' }),
);

const stop = () => {
  children.forEach((c) => c.kill());
  process.exit();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((c) => c.on('exit', (code) => code && stop()));
