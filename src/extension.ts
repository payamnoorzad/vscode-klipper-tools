import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { KlipperCompletionProvider } from './providers/completionProvider';
import { KlipperHoverProvider } from './providers/hoverProvider';
import { KlipperDiagnosticsProvider } from './providers/diagnosticsProvider';
import { KlipperDefinitionProvider } from './providers/definitionProvider';
import { MoonrakerService } from './services/moonrakerService';
import { KlipperStatusBarService } from './services/statusBarService';
import { KlipperProjectTreeProvider, KlipperRemoteTreeProvider } from './views/klipperTreeView';

import { dynamicSchemaManager } from './schema/dynamicSchemaManager';

export function activate(context: vscode.ExtensionContext) {
  const klipperSelector: vscode.DocumentSelector = { language: 'klipper-config', scheme: 'file' };

  // =========================================================================
  // 1. Language Tooling & IntelliSense Providers
  // =========================================================================
  const diagnosticsProvider = new KlipperDiagnosticsProvider(context);

  // Scan workspace for custom sections & modules on activate
  dynamicSchemaManager.scanWorkspaceForCustomSections().then(() => {
    if (vscode.window.activeTextEditor) {
      diagnosticsProvider.validateDocument(vscode.window.activeTextEditor.document);
    }
  });

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      diagnosticsProvider.validateDocument(doc);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      diagnosticsProvider.validateDocument(e.document);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      diagnosticsProvider.clearDocument(doc);
    })
  );

  const completionProvider = new KlipperCompletionProvider();
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      klipperSelector,
      completionProvider,
      '[', ':', ' ', '_'
    )
  );

  const hoverProvider = new KlipperHoverProvider();
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(klipperSelector, hoverProvider)
  );

  const definitionProvider = new KlipperDefinitionProvider();
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(klipperSelector, definitionProvider)
  );

  // =========================================================================
  // 2. Moonraker Remote Client & Status Bar
  // =========================================================================
  const config = vscode.workspace.getConfiguration('klipper');
  const defaultHost = config.get<string>('moonraker.url', 'http://localhost:7125');
  const defaultApiKey = config.get<string>('moonraker.apiKey', '');

  const moonraker = new MoonrakerService(defaultHost, defaultApiKey);
  const statusBar = new KlipperStatusBarService(moonraker);
  context.subscriptions.push(statusBar);

  // Auto-connect to printer on startup if URL is configured
  if (defaultHost && defaultHost !== 'http://localhost:7125') {
    moonraker.connect().catch(() => {});
  }

  // =========================================================================
  // 3. Project & Remote Tree Views (Sidebar)
  // =========================================================================
  const projectTreeProvider = new KlipperProjectTreeProvider();
  vscode.window.registerTreeDataProvider('klipperProjectView', projectTreeProvider);

  const remoteTreeProvider = new KlipperRemoteTreeProvider(moonraker);
  vscode.window.registerTreeDataProvider('klipperRemoteView', remoteTreeProvider);

  // Auto-refresh project tree & schema when files change
  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.cfg');
  fileWatcher.onDidChange(() => {
    projectTreeProvider.refresh();
    dynamicSchemaManager.scanWorkspaceForCustomSections();
  });
  fileWatcher.onDidCreate(() => {
    projectTreeProvider.refresh();
    dynamicSchemaManager.scanWorkspaceForCustomSections();
  });
  fileWatcher.onDidDelete(() => {
    projectTreeProvider.refresh();
    dynamicSchemaManager.scanWorkspaceForCustomSections();
  });
  context.subscriptions.push(fileWatcher);

  // =========================================================================
  // 4. Command Registrations
  // =========================================================================

  // Connect to Printer
  context.subscriptions.push(
    vscode.commands.registerCommand('klipper.connect', async () => {
      const hostInput = await vscode.window.showInputBox({
        prompt: 'Enter Moonraker Host URL or IP address',
        value: moonraker.getHost(),
        placeHolder: 'http://192.168.1.50:7125 or http://mainsail.local',
      });

      if (!hostInput) return;

      moonraker.setHost(hostInput);
      await config.update('moonraker.url', hostInput, vscode.ConfigurationTarget.Global);

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Connecting to Klipper at ${hostInput}...`,
          cancellable: false,
        },
        async () => {
          try {
            const state = await moonraker.connect();
            vscode.window.showInformationMessage(
              `✅ Connected to Klipper! State: ${state.state.toUpperCase()}`
            );
            remoteTreeProvider.refresh();
          } catch (err: any) {
            vscode.window.showErrorMessage(
              `❌ Failed to connect to Klipper: ${err.message}`
            );
          }
        }
      );
    })
  );

  // Disconnect
  context.subscriptions.push(
    vscode.commands.registerCommand('klipper.disconnect', () => {
      moonraker.disconnect();
      vscode.window.showInformationMessage('Disconnected from Klipper.');
      remoteTreeProvider.refresh();
    })
  );

  // Firmware Restart (FIRMWARE_RESTART)
  context.subscriptions.push(
    vscode.commands.registerCommand('klipper.restart', async () => {
      const confirm = await vscode.window.showWarningMessage(
        '🔄 Are you sure you want to restart Klipper firmware (FIRMWARE_RESTART)?',
        { modal: true },
        'Restart Klipper'
      );
      if (confirm !== 'Restart Klipper') {
        return;
      }

      try {
        await moonraker.restartKlipper();
        vscode.window.showInformationMessage('🔄 Klipper Firmware Restart command sent.');
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to restart: ${err.message}`);
      }
    })
  );

  // Save Config (SAVE_CONFIG)
  context.subscriptions.push(
    vscode.commands.registerCommand('klipper.saveConfig', async () => {
      const confirm = await vscode.window.showWarningMessage(
        '💾 Are you sure you want to execute SAVE_CONFIG? This will save all calibrated values (PID, bed mesh, Z offset) and restart Klipper.',
        { modal: true },
        'Save & Restart'
      );
      if (confirm !== 'Save & Restart') {
        return;
      }

      try {
        await moonraker.sendGcode('SAVE_CONFIG');
        vscode.window.showInformationMessage('💾 SAVE_CONFIG command sent.');
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to save config: ${err.message}`);
      }
    })
  );

  // Home All Axes (G28)
  context.subscriptions.push(
    vscode.commands.registerCommand('klipper.homeAll', async () => {
      const confirm = await vscode.window.showWarningMessage(
        '🏠 Are you sure you want to Home All Axes (G28)? Please ensure the bed and toolhead are clear.',
        { modal: true },
        'Home All (G28)'
      );
      if (confirm !== 'Home All (G28)') {
        return;
      }

      try {
        await moonraker.sendGcode('G28');
        vscode.window.showInformationMessage('🏠 G28 Homing initiated.');
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to home: ${err.message}`);
      }
    })
  );

  // Emergency Stop (M112)
  context.subscriptions.push(
    vscode.commands.registerCommand('klipper.emergencyStop', async () => {
      const confirm = await vscode.window.showWarningMessage(
        '🛑 Are you sure you want to trigger Emergency Stop (M112)? This immediately cuts power to all motors and heaters!',
        { modal: true },
        'Yes, Emergency Stop'
      );
      if (confirm === 'Yes, Emergency Stop') {
        await moonraker.emergencyStop();
        vscode.window.showErrorMessage('🛑 Emergency Stop triggered!');
      }
    })
  );

  // Refresh Project View
  context.subscriptions.push(
    vscode.commands.registerCommand('klipper.refreshProject', () => {
      projectTreeProvider.refresh();
      remoteTreeProvider.refresh();
    })
  );

  // Open Remote Config File directly and track for upload
  context.subscriptions.push(
    vscode.commands.registerCommand('klipper.openRemoteConfig', async (remoteFilePath: string) => {
      if (!remoteFilePath) return;

      try {
        const content = await moonraker.downloadConfigFile(remoteFilePath);
        const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        let targetUri: vscode.Uri;

        if (wsFolder) {
          const remoteCacheDir = path.join(wsFolder, '.klipper_remote');
          const localPath = path.join(remoteCacheDir, remoteFilePath);
          fs.mkdirSync(path.dirname(localPath), { recursive: true });
          fs.writeFileSync(localPath, content, 'utf8');
          targetUri = vscode.Uri.file(localPath);
        } else {
          // Open as in-memory document
          const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'klipper-config',
          });
          await vscode.window.showTextDocument(doc, { preview: false });
          return;
        }

        const doc = await vscode.workspace.openTextDocument(targetUri);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to open remote config: ${err.message}`);
      }
    })
  );

  // Auto-upload when saving files from .klipper_remote
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (!moonraker.currentState.connected || doc.languageId !== 'klipper-config') {
        return;
      }

      const filePath = doc.uri.fsPath;
      const isRemoteCache = filePath.includes('.klipper_remote');

      if (isRemoteCache) {
        const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const remoteCacheDir = wsFolder ? path.join(wsFolder, '.klipper_remote') : '';
        const relativeRemotePath = path.relative(remoteCacheDir, filePath).replace(/\\/g, '/');
        const filename = path.basename(filePath);

        const action = await vscode.window.showInformationMessage(
          `📤 Upload changes in "${relativeRemotePath}" to Klipper printer?`,
          'Upload & Restart',
          'Upload Only',
          'Cancel'
        );

        if (action === 'Upload & Restart' || action === 'Upload Only') {
          try {
            await moonraker.saveConfigFile(relativeRemotePath, doc.getText());
            vscode.window.showInformationMessage(`✅ Successfully uploaded "${relativeRemotePath}" to Klipper!`);
            if (action === 'Upload & Restart') {
              await moonraker.restartKlipper();
              vscode.window.showInformationMessage('🔄 Klipper restarted.');
            }
          } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to upload: ${err.message}`);
          }
        }
      }
    })
  );

  // Download All Configs to Workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('klipper.downloadAllConfigs', async () => {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Please open a workspace folder first to save config files.');
        return;
      }

      const confirm = await vscode.window.showInformationMessage(
        '📥 Download and sync all configuration files and folders from Klipper into the current workspace folder?',
        { modal: true },
        'Download & Sync'
      );
      if (confirm !== 'Download & Sync') {
        return;
      }

      const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Downloading all Klipper config files...',
          cancellable: false,
        },
        async (progress) => {
          try {
            const allFiles = await moonraker.listConfigFiles();
            const backupPattern = /^printer-\d{8}_\d{6}.*\.cfg$/i;
            // Exclude auto-backups to keep workspace clean
            const files = allFiles.filter((f) => !backupPattern.test(f.filename));

            let count = 0;
            for (const file of files) {
              progress.report({ message: `${file.path} (${++count}/${files.length})` });
              const content = await moonraker.downloadConfigFile(file.path);
              const targetPath = path.join(rootPath, file.path);
              fs.mkdirSync(path.dirname(targetPath), { recursive: true });
              fs.writeFileSync(targetPath, content, 'utf8');
            }
            projectTreeProvider.refresh();
            remoteTreeProvider.refresh();
            vscode.window.showInformationMessage(
              `✅ Successfully synced ${files.length} active config files from Klipper!`
            );
          } catch (err: any) {
            vscode.window.showErrorMessage(`Download failed: ${err.message}`);
          }
        }
      );
    })
  );
  // Clear / Reset Workspace Configs
  context.subscriptions.push(
    vscode.commands.registerCommand('klipper.clearLocalConfigs', async () => {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        '🧹 Are you sure you want to clear all downloaded config files from the current workspace?',
        { modal: true },
        'Clear Workspace'
      );
      if (confirm !== 'Clear Workspace') {
        return;
      }

      const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
      try {
        const files = fs.readdirSync(rootPath);
        for (const file of files) {
          const fullPath = path.join(rootPath, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else if (file.endsWith('.cfg') || file.endsWith('.conf')) {
            fs.unlinkSync(fullPath);
          }
        }
        projectTreeProvider.refresh();
        vscode.window.showInformationMessage('🧹 Workspace config files cleared!');
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to clear files: ${err.message}`);
      }
    })
  );

  // Show Quick Actions Menu (Status bar click handler)
  context.subscriptions.push(
    vscode.commands.registerCommand('klipper.showActionsMenu', async () => {
      const items: (vscode.QuickPickItem & { action?: string })[] = [];

      if (moonraker.currentState.connected) {
        const state = moonraker.currentState;
        items.push({
          label: `🟢 Connected: ${moonraker.getHost()}`,
          description: `Status: ${state.state.toUpperCase()} | Extruder: ${state.extruderTemp ?? '--'}°C | Bed: ${state.bedTemp ?? '--'}°C`,
          action: 'noop',
        });
        items.push({ label: '🔄 Firmware Restart (FIRMWARE_RESTART)', action: 'klipper.restart' });
        items.push({ label: '💾 Save Config (SAVE_CONFIG)', action: 'klipper.saveConfig' });
        items.push({ label: '🏠 Home All Axes (G28)', action: 'klipper.homeAll' });
        items.push({ label: '📥 Download All Configs to Workspace', action: 'klipper.downloadAllConfigs' });
        items.push({ label: '🛑 Emergency Stop (M112)', action: 'klipper.emergencyStop' });
        items.push({ label: '❌ Disconnect', action: 'klipper.disconnect' });
      } else {
        items.push({ label: '🔌 Connect to Klipper / Moonraker', action: 'klipper.connect' });
      }

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Klipper Tools Actions',
      });

      if (selected && selected.action && selected.action !== 'noop') {
        vscode.commands.executeCommand(selected.action);
      }
    })
  );

  console.log('Klipper Tools extension is now fully active with Moonraker integration.');
}

export function deactivate() {}
