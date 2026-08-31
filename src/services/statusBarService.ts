import * as vscode from 'vscode';
import { MoonrakerService, PrinterState } from './moonrakerService';

/**
 * Manages the interactive Klipper status bar item in VS Code.
 */
export class KlipperStatusBarService {
  private statusBarItem: vscode.StatusBarItem;
  private moonraker: MoonrakerService;

  constructor(moonraker: MoonrakerService) {
    this.moonraker = moonraker;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'klipper.showActionsMenu';
    this.updateStatus(this.moonraker.currentState);

    this.moonraker.onStateChange((state) => {
      this.updateStatus(state);
    });

    this.statusBarItem.show();
  }

  public updateStatus(state: PrinterState): void {
    if (!state.connected) {
      this.statusBarItem.text = '$(plug) Klipper: Disconnected';
      this.statusBarItem.tooltip = 'Click to connect to Klipper / Moonraker';
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    const stateIcon = state.state === 'ready' ? '$(check)' : '$(alert)';
    const thermals = state.thermals || [];
    const extruders = thermals.filter((t) => t.type === 'extruder');
    const bed = thermals.find((t) => t.type === 'bed');

    let text = `${stateIcon} Klipper: ${state.state.toUpperCase()}`;

    if (extruders.length > 0) {
      const extStr = extruders.map((e, idx) => `E${idx}:${e.actual}°`).join(' ');
      text += ` | 🔥 ${extStr}`;
    } else if (state.extruderTemp !== undefined) {
      text += ` | 🔥 ${state.extruderTemp.toFixed(1)}°C`;
    }

    if (bed) {
      text += ` | 🛏️ ${bed.actual}°C`;
    } else if (state.bedTemp !== undefined) {
      text += ` | 🛏️ ${state.bedTemp.toFixed(1)}°C`;
    }

    this.statusBarItem.text = text;

    let tooltipLines = [
      `Connected to ${state.hostname || 'Klipper'}`,
      `State: ${state.state.toUpperCase()}`,
      '--- Thermals ---',
    ];
    for (const t of thermals) {
      tooltipLines.push(`${t.displayName}: ${t.actual}°C${t.target ? ` / ${t.target}°C` : ''}`);
    }
    tooltipLines.push('----------------');
    tooltipLines.push('Click for quick actions');

    this.statusBarItem.tooltip = tooltipLines.join('\n');
    this.statusBarItem.backgroundColor = state.state === 'error' || state.state === 'shutdown'
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : undefined;
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
