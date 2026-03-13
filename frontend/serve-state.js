#!/usr/bin/env node

/**
 * Simple HTTP server that serves the scanner's latest state file
 * This allows the frontend to fetch market data via HTTP
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3002;
// Scanner saves backup to project root, not frontend directory
const STATE_FILE = path.join(__dirname, '..', '.protocol-state-backup', 'latest-state.json');

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/latest-state.json' || req.url === '/') {
    fs.readFile(STATE_FILE, 'utf8', (err, data) => {
      if (err) {
        console.error('Error reading state file:', err);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'State file not found' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`✓ State file server running on http://localhost:${PORT}`);
  console.log(`✓ Serving: ${STATE_FILE}`);
  console.log(`✓ Frontend can fetch from: http://localhost:${PORT}/latest-state.json`);
});
