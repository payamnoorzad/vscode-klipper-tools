import * as vscode from 'vscode';
import { parseKlipperDocument, ParsedSection, MacroDefinition } from '../parser/klipperParser';
import { MoonrakerService, RemoteConfigFile } from '../services/moonrakerService';

export class KlipperTreeItem extends vscode.TreeItem {
  public childNodes?: KlipperTreeItem[];

  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: 'category' | 'section' | 'macro' | 'file' | 'action' | 'status' | 'remoteFile' | 'remoteFolder' | 'remoteBackups',
    public readonly location?: vscode.Location,
    public readonly descriptionText?: string,
    public readonly commandId?: string,
    public readonly commandArgs?: any[],
    public readonly categoryId?: string,
    public readonly remotePath?: string
  ) {
    super(label, collapsibleState);
    this.description = descriptionText;
    this.contextValue = itemType;

    if (location) {
      this.command = {
        command: 'vscode.open',
        title: 'Open Section',
        arguments: [
          location.uri,
          { selection: location.range, preview: false },
        ],
      };
    } else if (commandId) {
      this.command = {
        command: commandId,
        title: label,
        arguments: commandArgs,
      };
    }

    this.setIcon();
  }

  private setIcon(): void {
    switch (this.itemType) {
      case 'category':
      case 'remoteFolder':
        this.iconPath = new vscode.ThemeIcon('folder');
        break;
      case 'remoteBackups':
        this.iconPath = new vscode.ThemeIcon('history');
        break;
      case 'macro':
        this.iconPath = new vscode.ThemeIcon('symbol-event');
        break;
      case 'section':
        this.iconPath = new vscode.ThemeIcon('symbol-property');
        break;
      case 'file':
        this.iconPath = new vscode.ThemeIcon('file-code');
        break;
      case 'remoteFile':
        this.iconPath = new vscode.ThemeIcon('file-code');
        break;
      case 'action':
        this.iconPath = new vscode.ThemeIcon('zap');
        break;
      case 'status':
        this.iconPath = new vscode.ThemeIcon('pulse');
        break;
    }
  }
}

/**
 * Tree Data Provider for local Klipper Workspace Project structure.
 */
export class KlipperProjectTreeProvider implements vscode.TreeDataProvider<KlipperTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<KlipperTreeItem | undefined | null | void> =
    new vscode.EventEmitter<KlipperTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<KlipperTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: KlipperTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: KlipperTreeItem): Promise<KlipperTreeItem[]> {
    if (!vscode.workspace.workspaceFolders) {
      return [];
    }

    const rawCfgFiles = await vscode.workspace.findFiles('**/*.cfg', '{**/node_modules/**,**/.klipper_remote/**,**/BackUp/**,**/backup/**}');
    const backupPattern = /^printer-\d{8}_\d{6}.*\.cfg$/i;
    const cfgFiles = rawCfgFiles.filter((f) => {
      const p = f.path.toLowerCase();
      const name = f.path.split('/').pop() || '';
      if (p.includes('.klipper_remote') || p.includes('/backup/') || p.includes('\\backup\\')) {
        return false;
      }
      return !backupPattern.test(name);
    });

    if (cfgFiles.length === 0) {
      return [
        new KlipperTreeItem(
          '📥 Sync Configs from Printer',
          vscode.TreeItemCollapsibleState.None,
          'action',
          undefined,
          'Click to download printer config files',
          'klipper.downloadAllConfigs'
        ),
      ];
    }

    // Root categories
    if (!element) {
      return [
        new KlipperTreeItem('MCUs & Kinematics', vscode.TreeItemCollapsibleState.Expanded, 'category', undefined, undefined, undefined, undefined, 'mcu'),
        new KlipperTreeItem('Motion & Steppers', vscode.TreeItemCollapsibleState.Expanded, 'category', undefined, undefined, undefined, undefined, 'motion'),
        new KlipperTreeItem('Heaters & Sensors', vscode.TreeItemCollapsibleState.Expanded, 'category', undefined, undefined, undefined, undefined, 'heaters'),
        new KlipperTreeItem('Fans', vscode.TreeItemCollapsibleState.Collapsed, 'category', undefined, undefined, undefined, undefined, 'fans'),
        new KlipperTreeItem('Probing & Bed Mesh', vscode.TreeItemCollapsibleState.Collapsed, 'category', undefined, undefined, undefined, undefined, 'probe'),
        new KlipperTreeItem('G-Code Macros', vscode.TreeItemCollapsibleState.Expanded, 'category', undefined, undefined, undefined, undefined, 'macros'),
        new KlipperTreeItem('Custom Modules & Extras', vscode.TreeItemCollapsibleState.Collapsed, 'category', undefined, undefined, undefined, undefined, 'custom'),
      ];
    }

    const categoryId = element.categoryId;
    const items: KlipperTreeItem[] = [];
    const seenItems = new Set<string>();

    // Parse all files in workspace
    for (const fileUri of cfgFiles) {
      const fileName = fileUri.path.split('/').pop() || '';
      try {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const parsed = parseKlipperDocument(doc);

        if (categoryId === 'macros') {
          for (const macro of parsed.macros) {
            const itemKey = `${macro.name}:${fileName}:${macro.line}`;
            if (!seenItems.has(itemKey)) {
              seenItems.add(itemKey);
              const loc = new vscode.Location(fileUri, macro.range);
              items.push(new KlipperTreeItem(macro.name, vscode.TreeItemCollapsibleState.None, 'macro', loc, fileName));
            }
          }
          continue;
        }

        for (const section of parsed.sections) {
          const loc = new vscode.Location(fileUri, section.headerRange);
          const base = section.baseName.toLowerCase();
          const itemKey = `${section.rawHeader}:${fileName}:${section.headerLine}`;

          if (seenItems.has(itemKey)) {
            continue;
          }

          if (categoryId === 'mcu' && (base === 'printer' || base === 'mcu')) {
            seenItems.add(itemKey);
            items.push(new KlipperTreeItem(`[${section.rawHeader}]`, vscode.TreeItemCollapsibleState.None, 'section', loc, fileName));
          } else if (categoryId === 'motion' && (base.startsWith('stepper_') || base.startsWith('tmc') || base === 'extruder')) {
            seenItems.add(itemKey);
            items.push(new KlipperTreeItem(`[${section.rawHeader}]`, vscode.TreeItemCollapsibleState.None, 'section', loc, fileName));
          } else if (categoryId === 'heaters' && (base === 'heater_bed' || base === 'extruder' || base.startsWith('temperature_'))) {
            seenItems.add(itemKey);
            items.push(new KlipperTreeItem(`[${section.rawHeader}]`, vscode.TreeItemCollapsibleState.None, 'section', loc, fileName));
          } else if (categoryId === 'fans' && base.includes('fan')) {
            seenItems.add(itemKey);
            items.push(new KlipperTreeItem(`[${section.rawHeader}]`, vscode.TreeItemCollapsibleState.None, 'section', loc, fileName));
          } else if (categoryId === 'probe' && (base === 'probe' || base === 'bltouch' || base === 'bed_mesh' || base === 'safe_z_home' || base === 'quad_gantry_level')) {
            seenItems.add(itemKey);
            items.push(new KlipperTreeItem(`[${section.rawHeader}]`, vscode.TreeItemCollapsibleState.None, 'section', loc, fileName));
          } else if (
            categoryId === 'custom' &&
            base !== 'printer' &&
            base !== 'mcu' &&
            !base.startsWith('stepper_') &&
            !base.startsWith('tmc') &&
            base !== 'extruder' &&
            base !== 'heater_bed' &&
            !base.startsWith('temperature_') &&
            !base.includes('fan') &&
            base !== 'probe' &&
            base !== 'bltouch' &&
            base !== 'bed_mesh' &&
            base !== 'safe_z_home' &&
            base !== 'quad_gantry_level' &&
            base !== 'gcode_macro' &&
            base !== 'include'
          ) {
            seenItems.add(itemKey);
            items.push(new KlipperTreeItem(`[${section.rawHeader}]`, vscode.TreeItemCollapsibleState.None, 'section', loc, fileName));
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return items;
  }
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  children: Map<string, TreeNode>;
}

/**
 * Tree Data Provider for Remote Klipper / Moonraker controls and files.
 */
export class KlipperRemoteTreeProvider implements vscode.TreeDataProvider<KlipperTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<KlipperTreeItem | undefined | null | void> =
    new vscode.EventEmitter<KlipperTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<KlipperTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private moonraker: MoonrakerService;

  constructor(moonraker: MoonrakerService) {
    this.moonraker = moonraker;
    this.moonraker.onStateChange(() => {
      this.refresh();
    });
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: KlipperTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: KlipperTreeItem): Promise<KlipperTreeItem[]> {
    if (!element) {
      if (!this.moonraker.currentState.connected) {
        return [
          new KlipperTreeItem('🔌 Connect to Klipper / Moonraker', vscode.TreeItemCollapsibleState.None, 'action', undefined, 'Click to connect', 'klipper.connect'),
        ];
      }

      const state = this.moonraker.currentState;
      const thermals = state.thermals || [];
      const extruders = thermals.filter((t) => t.type === 'extruder');
      const bed = thermals.find((t) => t.type === 'bed');

      let extSummary = '';
      if (extruders.length > 0) {
        extSummary = extruders.map((e, idx) => `E${idx}: ${e.actual}°C`).join(' | ');
      } else {
        extSummary = `Extruder: ${state.extruderTemp?.toFixed(1) ?? '--'}°C`;
      }
      const bedSummary = bed ? `Bed: ${bed.actual}°C` : `Bed: ${state.bedTemp?.toFixed(1) ?? '--'}°C`;
      const statusDesc = `State: ${state.state.toUpperCase()} | ${extSummary} | ${bedSummary}`;

      return [
        new KlipperTreeItem(`🟢 Connected: ${this.moonraker.getHost()}`, vscode.TreeItemCollapsibleState.None, 'status', undefined, statusDesc),
        new KlipperTreeItem('🔥 Thermals & Sensors', vscode.TreeItemCollapsibleState.Expanded, 'category', undefined, `${thermals.length} active sensors`, undefined, undefined, 'thermals'),
        new KlipperTreeItem('⚡ Quick Actions', vscode.TreeItemCollapsibleState.Collapsed, 'category', undefined, undefined, undefined, undefined, 'actions'),
        new KlipperTreeItem('📂 Remote Config Files', vscode.TreeItemCollapsibleState.Expanded, 'category', undefined, undefined, undefined, undefined, 'remoteFiles'),
      ];
    }

    if (element.categoryId === 'thermals') {
      const thermals = this.moonraker.currentState.thermals || [];
      if (thermals.length === 0) {
        return [new KlipperTreeItem('No thermal sensors detected', vscode.TreeItemCollapsibleState.None, 'status')];
      }

      return thermals.map((t) => {
        let icon = '🌡️';
        if (t.type === 'extruder') icon = '🔥';
        else if (t.type === 'bed') icon = '🛏️';
        else if (t.type === 'fan') icon = '💨';

        let targetInfo = '';
        if (t.target !== undefined && t.target > 0) {
          targetInfo = ` / ${t.target}°C`;
        } else if (t.type === 'extruder' || t.type === 'bed') {
          targetInfo = ' / off';
        }

        const label = `${icon} ${t.displayName}`;
        const desc = `${t.actual}°C${targetInfo}`;
        return new KlipperTreeItem(label, vscode.TreeItemCollapsibleState.None, 'status', undefined, desc);
      });
    }

    if (element.categoryId === 'actions') {
      return [
        new KlipperTreeItem('🔄 Firmware Restart (FIRMWARE_RESTART)', vscode.TreeItemCollapsibleState.None, 'action', undefined, 'Restart Klipper', 'klipper.restart'),
        new KlipperTreeItem('💾 Save Config (SAVE_CONFIG)', vscode.TreeItemCollapsibleState.None, 'action', undefined, 'Save & Restart', 'klipper.saveConfig'),
        new KlipperTreeItem('🏠 Home All (G28)', vscode.TreeItemCollapsibleState.None, 'action', undefined, 'G28', 'klipper.homeAll'),
        new KlipperTreeItem('🛑 Emergency Stop (M112)', vscode.TreeItemCollapsibleState.None, 'action', undefined, 'M112', 'klipper.emergencyStop'),
        new KlipperTreeItem('📥 Sync All Configs to Workspace', vscode.TreeItemCollapsibleState.None, 'action', undefined, 'Download', 'klipper.downloadAllConfigs'),
        new KlipperTreeItem('❌ Disconnect', vscode.TreeItemCollapsibleState.None, 'action', undefined, '', 'klipper.disconnect'),
      ];
    }

    if (element.categoryId === 'remoteFiles') {
      try {
        const files = await this.moonraker.listConfigFiles();
        if (files.length === 0) {
          return [new KlipperTreeItem('No configuration files found on printer', vscode.TreeItemCollapsibleState.None, 'status')];
        }

        return this.buildHierarchicalTree(files);
      } catch (err: any) {
        return [new KlipperTreeItem(`Error loading remote files: ${err.message}`, vscode.TreeItemCollapsibleState.None, 'status')];
      }
    }

    if (element.childNodes && element.childNodes.length > 0) {
      return element.childNodes;
    }

    return [];
  }

  private buildHierarchicalTree(files: RemoteConfigFile[]): KlipperTreeItem[] {
    const rootNode: TreeNode = {
      name: 'root',
      path: '',
      isDirectory: true,
      children: new Map(),
    };

    const backupFiles: RemoteConfigFile[] = [];

    // Check if filename is an auto-backup (e.g. printer-20230526_120608.cfg)
    const backupPattern = /^printer-\d{8}_\d{6}.*\.cfg$/i;

    for (const file of files) {
      const filename = file.filename;
      if (backupPattern.test(filename)) {
        backupFiles.push(file);
        continue;
      }

      // Build path segments (e.g. "macros/sub/test.cfg")
      const segments = file.path.split('/').filter(Boolean);
      let current = rootNode;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const isLast = i === segments.length - 1;

        if (!current.children.has(seg)) {
          current.children.set(seg, {
            name: seg,
            path: segments.slice(0, i + 1).join('/'),
            isDirectory: !isLast,
            size: isLast ? file.size : undefined,
            children: new Map(),
          });
        }
        current = current.children.get(seg)!;
      }
    }

    const items: KlipperTreeItem[] = this.convertTreeNodeToTreeItems(rootNode);

    // Add Backups category at the bottom if any backups exist
    if (backupFiles.length > 0) {
      const backupItem = new KlipperTreeItem(
        `Auto-Backups (${backupFiles.length} files)`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'remoteBackups',
        undefined,
        'Klipper SAVE_CONFIG snapshots'
      );

      backupItem.childNodes = backupFiles.map(
        (f) =>
          new KlipperTreeItem(
            f.filename,
            vscode.TreeItemCollapsibleState.None,
            'remoteFile',
            undefined,
            `${(f.size / 1024).toFixed(1)} KB`,
            'klipper.openRemoteConfig',
            [f.path],
            undefined,
            f.path
          )
      );

      items.push(backupItem);
    }

    return items;
  }

  private convertTreeNodeToTreeItems(node: TreeNode): KlipperTreeItem[] {
    const items: KlipperTreeItem[] = [];

    // Sort: directories first, then files alphabetically (with printer.cfg at top)
    const sortedEntries = Array.from(node.children.values()).sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      if (a.name.toLowerCase() === 'printer.cfg') return -1;
      if (b.name.toLowerCase() === 'printer.cfg') return 1;
      return a.name.localeCompare(b.name);
    });

    for (const child of sortedEntries) {
      if (child.isDirectory) {
        const folderItem = new KlipperTreeItem(
          child.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          'remoteFolder',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          child.path
        );
        folderItem.childNodes = this.convertTreeNodeToTreeItems(child);
        items.push(folderItem);
      } else {
        const fileItem = new KlipperTreeItem(
          child.name,
          vscode.TreeItemCollapsibleState.None,
          'remoteFile',
          undefined,
          child.size !== undefined ? `${(child.size / 1024).toFixed(1)} KB` : '',
          'klipper.openRemoteConfig',
          [child.path],
          undefined,
          child.path
        );
        items.push(fileItem);
      }
    }

    return items;
  }
}
