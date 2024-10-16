// src/worker.ts

import sqlite3InitModule from './sqlite3/sqlite3-bundler-friendly.mjs';

// Create the OPFS async proxy worker (only if browser supports OPFS)
let opfsProxyWorker: Worker | null = null;
if (typeof navigator.storage?.getDirectory === 'function') {
  opfsProxyWorker = new Worker(
    new URL('./sqlite3/sqlite3-opfs-async-proxy.js', import.meta.url),
    { type: 'classic' }
  );
}

let sqlite3: any;
let useOpfs = false;
let db: any;

self.onmessage = async (event) => {
  const { id, action, sql } = event.data;

  switch (action) {
    case 'init':
      try {
        await initSQLite();
        self.postMessage({ id, result: 'SQLite initialized' });
      } catch (error) {
        const err = error as Error;
        self.postMessage({ id, error: err.message });
      }
      break;
    case 'exec':
      try {
        const result = await executeSQL(sql);
        self.postMessage({ id, result });
      } catch (error) {
        const err = error as Error;
        self.postMessage({ id, error: err.message });
      }
      break;
    default:
      self.postMessage({ id, error: 'Unknown action' });
  }
};

async function initSQLite() {
  sqlite3 = await sqlite3InitModule({
    locateFile: (file: string) => {
      if (file === 'sqlite3.wasm') {
        return new URL('./sqlite3/sqlite3.wasm', import.meta.url).toString();
      } else if (file === 'sqlite3-opfs-async-proxy.js') {
        return new URL('./sqlite3/sqlite3-opfs-async-proxy.js', import.meta.url).toString();
      }
      return file;
    },
    opfsAsyncWorker: opfsProxyWorker ?? undefined,
  });

  if (!sqlite3) {
    throw new Error('Failed to initialize SQLite');
  }

  // Try to install OPFS VFS
  try {
    // Use the correct method to install OPFS VFS
    await sqlite3.initOpfsVfs();

    if (sqlite3.vfs.find('opfs')) {
      useOpfs = true;
    } else {
      console.warn('OPFS VFS not installed; falling back to in-memory storage');
    }
  } catch (e) {
    console.warn('Failed to install OPFS VFS:', (e as Error).message);
    // Fallback to in-memory storage
    useOpfs = false;
  }

  // Open the database and keep it open
  if (useOpfs) {
    // Open a database with OPFS storage using the OPFS VFS
    db = new sqlite3.oo1.DB('/my-database.db', 'ct', 'opfs');
  } else {
    // Use an in-memory database
    db = new sqlite3.oo1.DB();
  }
}

async function executeSQL(sql: string) {
  if (!sqlite3) {
    throw new Error('SQLite not initialized');
  }

  if (!db) {
    throw new Error('Database not opened');
  }

  try {
    const results: any[] = [];
    db.exec({
      sql,
      resultRows: results,
    });
    return results;
  } catch (error) {
    throw error;
  }
  // Do not close the database here
}

// Close the database when the worker is terminated
self.onclose = () => {
  if (db) {
    db.close();
    db = null;
  }
};
