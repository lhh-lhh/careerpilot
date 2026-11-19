import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export function loadDeepseekKey(): string {
  const override = process.env.CAREERPILOT_DEEPSEEK_API_KEY?.trim();
  if (override) return override;
  if (process.platform !== 'win32') return '';
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('../../scripts/configure-deepseek.ps1', import.meta.url)), '-Read'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
  return result.status === 0 ? result.stdout.trim() : '';
}
