/**
 * Moonraker API Client service for communicating with Klipper via Moonraker REST & WebSocket API.
 */

export interface ThermalItem {
  name: string;
  displayName: string;
  type: 'extruder' | 'bed' | 'sensor' | 'fan';
  actual: number;
  target?: number;
  power?: number;
}

export interface PrinterState {
  connected: boolean;
  state: 'ready' | 'error' | 'shutdown' | 'startup' | 'disconnected';
  stateMessage?: string;
  extruderTemp?: number;
  extruderTarget?: number;
  bedTemp?: number;
  bedTarget?: number;
  hostname?: string;
  thermals?: ThermalItem[];
}

export interface RemoteConfigFile {
  filename: string;
  path: string;
  size: number;
  modified: number;
}

export class MoonrakerService {
  private hostUrl: string = 'http://localhost:7125';
  private apiKey?: string;
  private pollInterval?: NodeJS.Timeout;
  private stateChangeListeners: ((state: PrinterState) => void)[] = [];
  private thermalObjectNames: string[] = ['extruder', 'heater_bed'];

  public currentState: PrinterState = {
    connected: false,
    state: 'disconnected',
  };

  constructor(hostUrl?: string, apiKey?: string) {
    if (hostUrl) {
      this.setHost(hostUrl, apiKey);
    }
  }

  public setHost(hostUrl: string, apiKey?: string): void {
    let cleanUrl = hostUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `http://${cleanUrl}`;
    }
    // Remove trailing slash
    this.hostUrl = cleanUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  public getHost(): string {
    return this.hostUrl;
  }

  public onStateChange(listener: (state: PrinterState) => void): void {
    this.stateChangeListeners.push(listener);
  }

  private notifyStateChange(): void {
    for (const listener of this.stateChangeListeners) {
      listener(this.currentState);
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }
    return headers;
  }

  /**
   * Connects to Moonraker, checks printer status, and begins live polling.
   */
  public async connect(): Promise<PrinterState> {
    try {
      const infoUrl = `${this.hostUrl}/printer/info`;
      const res = await fetch(infoUrl, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as any;
      const printerInfo = data.result || {};

      this.currentState = {
        connected: true,
        state: printerInfo.state || 'ready',
        stateMessage: printerInfo.state_message,
        hostname: this.hostUrl,
      };

      // Introspect live printer objects and register thermal sensors
      await this.discoverLivePrinterObjects();

      // Query initial temperature status for all discovered heaters/sensors
      await this.updatePrinterStatus();

      // Start status polling every 2 seconds
      this.startPolling();

      this.notifyStateChange();
      return this.currentState;
    } catch (err: any) {
      this.currentState = {
        connected: false,
        state: 'disconnected',
        stateMessage: err.message || 'Connection failed',
      };
      this.stopPolling();
      this.notifyStateChange();
      throw err;
    }
  }

  /**
   * Queries all registered printer objects from Moonraker (GET /printer/objects/list).
   */
  public async listPrinterObjects(): Promise<string[]> {
    try {
      const url = `${this.hostUrl}/printer/objects/list`;
      const res = await fetch(url, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) return [];

      const data = (await res.json()) as any;
      return data.result?.objects || [];
    } catch {
      return [];
    }
  }

  /**
   * Discovers and queries live printer objects from Klipper.
   */
  public async discoverLivePrinterObjects(): Promise<void> {
    try {
      const objects = await this.listPrinterObjects();
      if (objects.length === 0) return;

      // Extract all thermal objects (extruders, beds, sensors, fans)
      this.thermalObjectNames = objects.filter((o) => {
        const lower = o.toLowerCase();
        return (
          lower === 'extruder' ||
          lower.startsWith('extruder') ||
          lower === 'heater_bed' ||
          lower.startsWith('heater_generic') ||
          lower.startsWith('temperature_sensor') ||
          lower.startsWith('temperature_fan')
        );
      });
      if (this.thermalObjectNames.length === 0) {
        this.thermalObjectNames = ['extruder', 'heater_bed'];
      }

      // Query live fields for custom objects
      const customObjects = objects.filter((o) => !o.startsWith('gcode_macro'));
      let objectDetails: Record<string, any> = {};

      if (customObjects.length > 0) {
        const queryParams = customObjects.slice(0, 35).map((o) => encodeURIComponent(o)).join('&');
        const queryUrl = `${this.hostUrl}/printer/objects/query?${queryParams}`;
        const queryRes = await fetch(queryUrl, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(5000),
        });

        if (queryRes.ok) {
          const queryData = (await queryRes.json()) as any;
          objectDetails = queryData.result?.status || {};
        }
      }

      // Dynamic import or notify schema manager
      const { dynamicSchemaManager } = await import('../schema/dynamicSchemaManager');
      dynamicSchemaManager.registerLivePrinterObjects(objects, objectDetails);
    } catch (err) {
      console.warn('Failed to introspect live printer objects:', err);
    }
  }

  public disconnect(): void {
    this.stopPolling();
    this.currentState = {
      connected: false,
      state: 'disconnected',
    };
    this.notifyStateChange();
  }

  public startPolling(): void {
    this.stopPolling();
    this.pollInterval = setInterval(async () => {
      if (this.currentState.connected) {
        try {
          await this.updatePrinterStatus();
        } catch {
          // Ignore transient poll errors
        }
      }
    }, 2000);
  }

  public stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  /**
   * Updates temperatures and state for all discovered extruders and sensors from Moonraker.
   */
  public async updatePrinterStatus(): Promise<void> {
    try {
      const queryList = Array.from(new Set([...this.thermalObjectNames, 'print_stats', 'heater_bed']));
      const queryParams = queryList.map((o) => encodeURIComponent(o)).join('&');
      const url = `${this.hostUrl}/printer/objects/query?${queryParams}`;
      const res = await fetch(url, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        const status = data.result?.status;
        if (status) {
          const thermals: ThermalItem[] = [];

          // Parse Extruders
          for (const key of Object.keys(status)) {
            const lower = key.toLowerCase();
            const val = status[key];
            if (lower === 'extruder' || /^extruder\d+$/i.test(lower)) {
              if (val && typeof val.temperature === 'number') {
                thermals.push({
                  name: key,
                  displayName: key.charAt(0).toUpperCase() + key.slice(1),
                  type: 'extruder',
                  actual: Math.round(val.temperature * 10) / 10,
                  target: Math.round((val.target || 0) * 10) / 10,
                  power: val.power ? Math.round(val.power * 100) : 0,
                });
              }
            } else if (lower === 'heater_bed') {
              if (val && typeof val.temperature === 'number') {
                thermals.push({
                  name: key,
                  displayName: 'Heater Bed',
                  type: 'bed',
                  actual: Math.round(val.temperature * 10) / 10,
                  target: Math.round((val.target || 0) * 10) / 10,
                  power: val.power ? Math.round(val.power * 100) : 0,
                });
              }
            } else if (lower.startsWith('temperature_sensor')) {
              if (val && typeof val.temperature === 'number') {
                const sensorName = key.replace(/^temperature_sensor\s+/i, '');
                thermals.push({
                  name: key,
                  displayName: sensorName,
                  type: 'sensor',
                  actual: Math.round(val.temperature * 10) / 10,
                });
              }
            } else if (lower.startsWith('temperature_fan')) {
              if (val && typeof val.temperature === 'number') {
                const fanName = key.replace(/^temperature_fan\s+/i, '');
                thermals.push({
                  name: key,
                  displayName: fanName,
                  type: 'fan',
                  actual: Math.round(val.temperature * 10) / 10,
                  target: Math.round((val.target || 0) * 10) / 10,
                });
              }
            }
          }

          this.currentState.thermals = thermals;

          // Main extruder & bed fallbacks
          if (status.extruder) {
            this.currentState.extruderTemp = status.extruder.temperature;
            this.currentState.extruderTarget = status.extruder.target;
          }
          if (status.heater_bed) {
            this.currentState.bedTemp = status.heater_bed.temperature;
            this.currentState.bedTarget = status.heater_bed.target;
          }
          if (status.print_stats && status.print_stats.state) {
            this.currentState.state = status.print_stats.state;
          }
          this.notifyStateChange();
        }
      }
    } catch {
      // Ignore polling hiccups
    }
  }

  /**
   * Executes a G-Code script on Klipper.
   */
  public async sendGcode(script: string): Promise<string> {
    const url = `${this.hostUrl}/printer/gcode/script`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ script }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Failed to send G-code: ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    return data.result || 'OK';
  }

  /**
   * Restarts Klipper host firmware (FIRMWARE_RESTART).
   */
  public async restartKlipper(): Promise<void> {
    const url = `${this.hostUrl}/printer/firmware_restart`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // Fallback to sending Gcode directly
      await this.sendGcode('FIRMWARE_RESTART');
    }
  }

  /**
   * Emergency Stop command (M112).
   */
  public async emergencyStop(): Promise<void> {
    const url = `${this.hostUrl}/printer/emergency_stop`;
    await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  }

  /**
   * Fetches list of all configuration files in root config directory.
   */
  public async listConfigFiles(): Promise<RemoteConfigFile[]> {
    const url = `${this.hostUrl}/server/files/list?root=config`;
    const res = await fetch(url, {
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    const items: any[] = data.result || [];

    return items
      .map((item) => {
        const fullPath = item.path || item.filename || '';
        const filename = fullPath.split('/').pop() || fullPath;
        return {
          filename,
          path: fullPath,
          size: item.size || 0,
          modified: item.modified || 0,
        };
      })
      .filter((item) => item.filename.endsWith('.cfg') || item.filename.endsWith('.conf'));
  }

  /**
   * Downloads a configuration file content from Moonraker (supporting nested subdirectories).
   */
  public async downloadConfigFile(filePath: string): Promise<string> {
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const url = `${this.hostUrl}/server/files/config/${encodedPath}`;
    const res = await fetch(url, {
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Failed to download ${filePath}: ${res.statusText}`);
    }

    return await res.text();
  }

  /**
   * Uploads/Saves configuration file content to Moonraker (supporting nested subdirectories).
   */
  public async saveConfigFile(filePath: string, content: string): Promise<void> {
    const url = `${this.hostUrl}/server/files/upload`;
    const formData = new FormData();
    const blob = new Blob([content], { type: 'text/plain' });
    formData.append('file', blob, filePath);
    formData.append('root', 'config');

    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Failed to upload ${filePath}: ${res.statusText}`);
    }
  }
}
