import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, exec } from 'child_process';
import net from 'net';
import fs from 'fs';

app.disableHardwareAcceleration();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let djangoProcess = null;
let whatsappProcess = null;


// ============================================
// PATH HELPERS
// ============================================

function getResourcesPath(...parts) {
    return path.join(process.resourcesPath, ...parts);
}


// ============================================
// WAIT FOR PORT
// ============================================

function waitForPort(host, port, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const check = () => {
            const socket = new net.Socket();

            socket.setTimeout(1000);

            socket.once('connect', () => {
                socket.destroy();
                resolve();
            });

            socket.once('error', () => {
                socket.destroy();

                if (Date.now() - startTime >= timeout) {
                    reject(
                        new Error(
                            `Server did not start within ${timeout / 1000} seconds.`
                        )
                    );
                } else {
                    setTimeout(check, 500);
                }
            });

            socket.once('timeout', () => {
                socket.destroy();

                if (Date.now() - startTime >= timeout) {
                    reject(
                        new Error(
                            `Server did not start within ${timeout / 1000} seconds.`
                        )
                    );
                } else {
                    setTimeout(check, 500);
                }
            });

            socket.connect(port, host);
        };

        check();
    });
}


// ============================================
// START DJANGO
// ============================================

function startDjango() {
    if (!app.isPackaged) {
        console.log('Development mode: Django is not started by Electron.');
        return;
    }

    const backendDirectory = getResourcesPath('backend');
    const djangoExe = path.join(
        backendDirectory,
        'serve.exe'
    );

    console.log('============================================');
    console.log('STARTING DJANGO');
    console.log('============================================');
    console.log('Django executable:', djangoExe);
    console.log('Django working directory:', backendDirectory);

    if (!fs.existsSync(djangoExe)) {
        console.error('DJANGO EXECUTABLE NOT FOUND AT:', djangoExe);
        return;
    }

    // Open Django in a visible CMD window.
    const command = `start "Django Server" cmd /k "${djangoExe}"`;

    djangoProcess = exec(
        command,
        {
            cwd: backendDirectory,
            windowsHide: false
        },
        (error) => {
            if (error) {
                console.error('DJANGO CMD ERROR:', error);
            }
        }
    );

    console.log('Django CMD window launched successfully.');
}


// ============================================
// START WHATSAPP
// ============================================




function startWhatsApp() {
    if (!app.isPackaged) {
        console.log('Development mode: WhatsApp bridge is not started by Electron.');
        return;
    }

    const whatsappDirectory = getResourcesPath('whatsapp');
    const whatsappExe = path.join(whatsappDirectory, 'whatsapp-server.exe');

    console.log('============================================');
    console.log('STARTING WHATSAPP BRIDGE');
    console.log('============================================');
    console.log('Executable:', whatsappExe);
    console.log('Working directory:', whatsappDirectory);

    if (!fs.existsSync(whatsappExe)) {
        console.error('WHATSAPP EXECUTABLE NOT FOUND AT:', whatsappExe);
        return;
    }

    /*
     * Launches a fresh, independent CMD terminal window titled 
     * "WhatsApp Bridge" that stays open continuously (/k).
     */
    const command = `start "WhatsApp Bridge" cmd /k "${whatsappExe}"`;

    whatsappProcess = exec(command, { cwd: whatsappDirectory }, (error) => {
        if (error) {
            console.error('WHATSAPP EXEC ERROR:', error);
        }
    });

    console.log('WhatsApp CMD window launched successfully.');
}

// ============================================
// CREATE WINDOW
// ============================================

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,

        title: 'Student Portal',

        icon: path.join(
            __dirname,
            'icon.ico'
        ),

        autoHideMenuBar: true,

        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false
        }
    });

    if (app.isPackaged) {
        const indexPath = getResourcesPath(
            'frontend',
            'dist',
            'index.html'
        );

        console.log('Loading frontend:');
        console.log(indexPath);

        mainWindow.loadFile(indexPath);
    } else {
        mainWindow.loadURL(
            'http://localhost:5173'
        );
    }

    mainWindow.webContents.on(
        'did-fail-load',
        (_event, errorCode, errorDescription) => {
            console.error(
                'Frontend failed to load:',
                errorCode,
                errorDescription
            );
        }
    );
}


// ============================================
// APP READY
// ============================================

app.whenReady().then(async () => {

    console.log('');
    console.log('============================================');
    console.log('STUDENT PORTAL STARTING');
    console.log('============================================');

    console.log('Packaged:', app.isPackaged);
    console.log('Resources:', process.resourcesPath);
    console.log('');

    // ----------------------------------------
    // START DJANGO
    // ----------------------------------------

    startDjango();

    // ----------------------------------------
    // START WHATSAPP
    // ----------------------------------------

    startWhatsApp();

    // ----------------------------------------
    // WAIT FOR DJANGO
    // ----------------------------------------

    if (app.isPackaged) {

        try {

            console.log(
                'Waiting for Django on 127.0.0.1:8000...'
            );

            await waitForPort(
                '127.0.0.1',
                8000,
                30000
            );

            console.log(
                'Django is READY.'
            );

        } catch (error) {

            console.error(
                '============================================'
            );

            console.error(
                'DJANGO STARTUP ERROR'
            );

            console.error(error);

            console.error(
                '============================================'
            );

        }
    }

    // ----------------------------------------
    // CREATE WINDOW
    // ----------------------------------------

    createWindow();

    // ----------------------------------------
    // ACTIVATE
    // ----------------------------------------

    app.on('activate', () => {

        if (
            BrowserWindow.getAllWindows().length === 0
        ) {
            createWindow();
        }

    });

});


// ============================================
// KILL PROCESS TREE
// ============================================

function killProcessTree(processObject, name) {

    if (!processObject || !processObject.pid) {
        return;
    }

    console.log(
        `Stopping ${name}. PID: ${processObject.pid}`
    );

    try {

        spawn(
            'taskkill',
            [
                '/pid',
                String(processObject.pid),
                '/T',
                '/F'
            ],
            {
                windowsHide: true
            }
        );

    } catch (error) {

        console.error(
            `Failed to stop ${name}:`,
            error
        );

    }
}


// ============================================
// APP QUIT
// ============================================

app.on('will-quit', () => {

    console.log(
        'Electron is quitting...'
    );

    killProcessTree(
        djangoProcess,
        'Django'
    );

    killProcessTree(
        whatsappProcess,
        'WhatsApp'
    );

    djangoProcess = null;
    whatsappProcess = null;

});


// ============================================
// CLOSE WINDOWS
// ============================================

app.on('window-all-closed', () => {

    if (process.platform !== 'darwin') {
        app.quit();
    }

});

