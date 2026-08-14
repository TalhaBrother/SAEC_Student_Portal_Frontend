import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let djangoProcess = null;

function startDjango() {
    if (!app.isPackaged) {
        return;
    }

    const resourcesPath = process.resourcesPath;

    const djangoExe = path.join(
        resourcesPath,
        'backend',
        'serve.exe'
    );
    
    console.log('resourcesPath:', process.resourcesPath);
    console.log('djangoExe:', djangoExe);

    djangoProcess = spawn(djangoExe, [], {
        cwd: resourcesPath,
        windowsHide: true,
        stdio: 'ignore'
    });

    djangoProcess.on('error', (error) => {
        console.error('Failed to start Django:', error);
    });

    djangoProcess.on('exit', (code, signal) => {
        console.log(`Django exited. Code: ${code}, Signal: ${signal}`);
    });
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Student Portal',
        icon: path.join(__dirname, 'icon.ico'),
        autoHideMenuBar: true,

        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // mainWindow.webContents.openDevTools();

    if (app.isPackaged) {
        const indexPath = path.join(
            process.resourcesPath,
            'frontend',
            'dist',
            'index.html'
        );

        mainWindow.loadFile(indexPath);
    } else {
        mainWindow.loadURL('http://localhost:5173');
    }
}

app.whenReady().then(() => {
    startDjango();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('will-quit', () => {
    if (djangoProcess) {
        djangoProcess.kill();
        djangoProcess = null;
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});