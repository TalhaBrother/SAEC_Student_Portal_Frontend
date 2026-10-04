import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, spawnSync } from 'child_process';
import net from 'net';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Must be called before the app is ready.
app.disableHardwareAcceleration();

const DJANGO_HOST = '127.0.0.1';
const DJANGO_PORT = 8000;
const DJANGO_START_TIMEOUT = 90000; // PyInstaller + PyArmor + matplotlib can be slow on first run

// Window titles double as handles so we can close the CMD windows on quit.
const DJANGO_TITLE = 'Django Server';
const WHATSAPP_TITLE = 'WhatsApp Bridge';
const DJANGO_IMAGE = 'serve.exe';
const WHATSAPP_IMAGE = 'whatsapp-server.exe';

let mainWindow = null;


// ============================================
// SINGLE INSTANCE LOCK
// A second launch must never start a second set of
// Django / WhatsApp CMD windows or a second Electron window.
// ============================================

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    // ONE whenReady handler only (the old file had two -> everything started twice).
    app.whenReady().then(main);
}


// ============================================
// HELPERS
// ============================================

function getResourcesPath(...parts) {
    return path.join(process.resourcesPath, ...parts);
}

function waitForPort(host, port, timeout) {
    return new Promise((resolve, reject) => {
        const start = Date.now();

        const retry = () => {
            if (Date.now() - start >= timeout) {
                return reject(new Error(`Server did not start within ${timeout / 1000} seconds.`));
            }
            setTimeout(check, 500);
        };

        const check = () => {
            const socket = new net.Socket();
            socket.setTimeout(1000);
            socket.once('connect', () => { socket.destroy(); resolve(); });
            socket.once('error', () => { socket.destroy(); retry(); });
            socket.once('timeout', () => { socket.destroy(); retry(); });
            socket.connect(port, host);
        };

        check();
    });
}


// ============================================
// KILL HELPERS (Windows)
// Close the CMD window (by title) AND the exe (by image name).
// Synchronous so it finishes before Electron exits.
// ============================================

function killByTitle(title) {
    spawnSync('taskkill', ['/FI', `WINDOWTITLE eq ${title}*`, '/T', '/F'], { windowsHide: true });
}

function killByImage(image) {
    spawnSync('taskkill', ['/IM', image, '/T', '/F'], { windowsHide: true });
}

function stopBackgroundServices() {
    if (process.platform !== 'win32') return;
    console.log('Stopping Django + WhatsApp...');
    killByTitle(DJANGO_TITLE);
    killByTitle(WHATSAPP_TITLE);
    killByImage(DJANGO_IMAGE);
    killByImage(WHATSAPP_IMAGE);
    killByTitle(DJANGO_TITLE);   // sweep any window left behind
    killByTitle(WHATSAPP_TITLE);
}


// ============================================
// START A SERVICE IN ITS OWN VISIBLE CMD WINDOW (stays open: /k)
// `title` inside the window keeps the window title stable so
// it can be closed on quit.
// ============================================

function startInConsole(title, exePath, cwd) {
    console.log('============================================');
    console.log(`STARTING ${title.toUpperCase()}`);
    console.log('Executable:', exePath);
    console.log('Working directory:', cwd);

    if (!fs.existsSync(exePath)) {
        console.error(`${title.toUpperCase()} EXECUTABLE NOT FOUND AT:`, exePath);
        return;
    }

    const command = `start "${title}" cmd /k "title ${title} & "${exePath}""`;

    exec(command, { cwd, windowsHide: false }, (error) => {
        if (error) console.error(`${title} CMD ERROR:`, error);
    });

    console.log(`${title} CMD window launched.`);
}

function startDjango() {
    if (!app.isPackaged) {
        console.log('Dev mode: Django is not started by Electron.');
        return;
    }
    const dir = getResourcesPath('backend');
    startInConsole(DJANGO_TITLE, path.join(dir, DJANGO_IMAGE), dir);
}

function startWhatsApp() {
    if (!app.isPackaged) {
        console.log('Dev mode: WhatsApp bridge is not started by Electron.');
        return;
    }
    const dir = getResourcesPath('whatsapp');
    startInConsole(WHATSAPP_TITLE, path.join(dir, WHATSAPP_IMAGE), dir);
}


// ============================================
// CREATE WINDOW
// ============================================

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Student Portal',
        icon: path.join(__dirname, 'icon.ico'),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
        },
    });

    mainWindow.on('closed', () => { mainWindow = null; });

    if (app.isPackaged) {
        const indexPath = getResourcesPath('frontend', 'dist', 'index.html');
        console.log('Loading frontend:', indexPath);
        mainWindow.loadFile(indexPath);
    } else {
        mainWindow.loadURL('http://localhost:5173');
    }

    mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
        console.error('Frontend failed to load:', code, desc);
    });
}


// ============================================
// MAIN
// ============================================

async function main() {
    console.log('STUDENT PORTAL STARTING | packaged:', app.isPackaged);

    if (app.isPackaged) {
        // Clear orphans from a previous crash so we never get duplicate windows
        // or a "port 8000 already in use" failure.
        stopBackgroundServices();
    }

    startDjango();
    startWhatsApp();

    if (app.isPackaged) {
        try {
            console.log(`Waiting for Django on ${DJANGO_HOST}:${DJANGO_PORT}...`);
            await waitForPort(DJANGO_HOST, DJANGO_PORT, DJANGO_START_TIMEOUT);
            console.log('Django is READY.');
        } catch (err) {
            console.error('DJANGO STARTUP ERROR:', err);
            dialog.showErrorBox(
                'Backend failed to start',
                `${err.message}\n\nCheck the "${DJANGO_TITLE}" console window for the error.`
            );
        }
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
}


// ============================================
// QUIT
// ============================================

app.on('will-quit', stopBackgroundServices);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});