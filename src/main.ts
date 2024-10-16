// src/main.ts

import { v4 as uuidv4 } from 'uuid';

type WorkerRequest = {
  id: string;
  action: string;
  sql?: string;
};

type WorkerResponse = {
  id: string;
  result?: any;
  error?: string;
};

const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module', // Important for module workers
});

const callbacks: { [id: string]: (response: Promise<any>) => void } = {};

worker.onmessage = (event) => {
  const { id, result, error } = event.data as WorkerResponse;
  if (callbacks[id]) {
    if (error) {
      callbacks[id](Promise.reject(new Error(error)));
    } else {
      callbacks[id](Promise.resolve(result));
    }
    delete callbacks[id];
  }
};

worker.onerror = (error) => {
  console.error('Worker error:', error);
};

function sendToWorker(request: WorkerRequest): Promise<any> {
  return new Promise((resolve, reject) => {
    callbacks[request.id] = (response: Promise<any>) => {
      response.then(resolve).catch(reject);
    };
    worker.postMessage(request);
  });
}

async function initialize() {
  try {
    const result = await sendToWorker({ id: uuidv4(), action: 'init' });
    console.log(result); // 'SQLite initialized'

    // Execute sample queries
    await executeSampleQueries();
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

export async function executeSQL(sql: string): Promise<any> {
  const id = uuidv4();
  return sendToWorker({ id, action: 'exec', sql });
}

async function executeSampleQueries() {
  try {
    // Create a table
    await executeSQL('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, value TEXT)');
    // Insert a row
    await executeSQL("INSERT INTO test (value) VALUES ('Hello, world!')");
    // Query the table
    const rows = await executeSQL('SELECT * FROM test');
    console.log('Query Results:', rows);
  } catch (error) {
    console.error('SQL Execution Error:', error);
  }
}

// Initialize SQLite
initialize();
