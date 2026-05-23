/**
 * Simple HTTP Server for Photo by Numbers
 *
 * A minimal Node.js HTTP server with no external dependencies.
 * Serves static files with proper MIME types for the web application.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8000;
const HOST = '0.0.0.0';

// MIME types for common file extensions
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.md': 'text/markdown'
};

/**
 * Gets the MIME type for a file based on its extension
 */
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Serves a file from the filesystem
 */
function serveFile(filePath, res) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>500 Internal Server Error</h1>');
            }
            return;
        }

        const mimeType = getMimeType(filePath);
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(data);
    });
}

/**
 * Main request handler
 */
const server = http.createServer((req, res) => {
    // Parse URL and remove query string
    let requestPath = req.url.split('?')[0];

    // Default to index.html for root path
    if (requestPath === '/') {
        requestPath = '/index.html';
    }

    // Prevent directory traversal attacks
    const sanitizedPath = path.normalize(requestPath).replace(/^(\.\.[\/\\])+/, '');

    // Serve from src directory
    const srcDir = path.join(__dirname, 'src');
    const filePath = path.join(srcDir, sanitizedPath);

    // Ensure the requested file is within the src directory
    if (!filePath.startsWith(srcDir)) {
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end('<h1>403 Forbidden</h1>');
        return;
    }

    // Log request
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

    // Serve the file
    serveFile(filePath, res);
});

server.listen(PORT, HOST, () => {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║                                                        ║');
    console.log('║           Photo by Numbers Server                      ║');
    console.log('║                                                        ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Server running at:`);
    console.log(`  → Local:   http://localhost:${PORT}`);
    console.log(`  → Network: http://${HOST}:${PORT}`);
    console.log('');
    console.log('  Press Ctrl+C to stop the server');
    console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n\nShutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\n\nShutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
