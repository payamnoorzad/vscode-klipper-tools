# 🚀 Klipper Tools (IntelliSense & Remote Control)

[![Visual Studio Code](https://img.shields.io/badge/VS%20Code-Extension-blue.svg)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Klipper Tools** is an all-in-one Visual Studio Code extension designed for Klipper 3D printer enthusiasts and developers. It brings modern IDE capabilities to your `printer.cfg` files and enables direct, seamless communication with your 3D printer via **Moonraker**.

---

## ✨ Features

### 🧠 Smart IntelliSense & Diagnostics
- **Context-Aware Autocomplete**: Auto-completes sections, pins, and configuration parameters based on dynamic Klipper schemas.
- **Real-Time Diagnostics**: Instant syntax checking and parameter validation for `.cfg` files.
- **G-Code & Macro Support**: Hover descriptions and syntax highlighting for G-Code commands and Jinja2 templates.

### 🌐 Direct Moonraker Integration
- **Live Status Bar**: Real-time display of printer state (Printing, Standby, Error), extruder/bed temperatures, and print progress.
- **Dedicated Sidebar**:
  - **Klipper Remote (Moonraker)**: View remote printer files, state, and quick action shortcuts.
  - **Klipper Project Explorer**: Manage and navigate workspace configuration files.

### 🎮 Quick Printer Controls
- **Restart Commands**: Execute `FIRMWARE_RESTART` and `SAVE_CONFIG` with one click.
- **Emergency Actions**: Quick Emergency Stop (`M112`) and Home All Axes (`G28`).

### ☁️ Bidirectional Config Sync
- **Download All Configs**: Pull all configuration files from Moonraker directly into your local workspace.
- **Upload Current File**: Instantly push the actively edited configuration file to the printer.

---

## ⚙️ Extension Settings

This extension contributes the following settings:

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `klipper.moonraker.url` | `string` | `http://localhost:7125` | Moonraker API host URL (e.g., `http://192.168.1.50:7125` or `http://mainsail.local`) |
| `klipper.moonraker.apiKey` | `string` | `""` | Optional API Key if Moonraker authentication is enabled |

---

## ⌨️ Commands

Access these commands via the VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) or the sidebar title menu:

- `Klipper: Connect to Printer` - Establish connection to Moonraker API.
- `Klipper: Disconnect` - Disconnect from Moonraker.
- `Klipper: Firmware Restart (FIRMWARE_RESTART)` - Trigger firmware restart.
- `Klipper: Save Config (SAVE_CONFIG)` - Save config and restart.
- `Klipper: Home All Axes (G28)` - Home X, Y, and Z axes.
- `Klipper: Emergency Stop (M112)` - Immediately shut down the printer.
- `Klipper: Sync All Configs to Workspace` - Download all remote config files.
- `Klipper: Upload Current File to Printer` - Upload open file to Moonraker.
- `Klipper: Clear / Reset Workspace Configs` - Clear local workspace configs.

---

## 🚀 Getting Started

1. Open your Klipper configuration folder in VS Code.
2. Open Settings (`Ctrl+,`) and search for `klipper.moonraker.url`.
3. Set your printer's IP / Host URL (e.g. `http://192.168.1.100:7125`).
4. Click the **Plug** icon in the Klipper sidebar or status bar to connect!

---

## 🛠️ Development & Contribution

```bash
# Clone repository
git clone https://github.com/payamnoorzad/vscode-klipper-tools.git

# Install dependencies
npm install

# Compile & build
npm run build

# Watch mode for extension debugging
npm run watch
```

Press `F5` in VS Code to launch a new Extension Development Host window for testing.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

Developed with ❤️ by [Payam Noorzad](https://github.com/payamnoorzad).
