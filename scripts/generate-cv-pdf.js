#!/usr/bin/env node
/**
 * Generates the CV PDF from the Jekyll-built CV page.
 * Run: npm run cv-pdf
 * First time: npx playwright install chromium
 *
 * Steps: build Jekyll -> serve _site -> open CV page in headless browser -> save as PDF.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 4321;
const SITE_DIR = path.join(__dirname, '..', '_site');
const CV_PATH = '/posts/curriculum-vitae/';
const OUT_DIR = path.join(__dirname, '..', 'assets', 'pdf');
const OUT_FILE = path.join(OUT_DIR, 'sergei_fedorov_cv.pdf');

function buildJekyll() {
  console.log('Building Jekyll site...');
  execSync('bundle exec jekyll build', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  });
}

function serveStatic(port) {
  const mime = {
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
  };

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      if (urlPath.endsWith('/')) urlPath += 'index.html';
      else if (!path.extname(urlPath)) {
        try {
          const withIndex = path.join(SITE_DIR, urlPath.replace(/^\//, ''), 'index.html');
          if (fs.existsSync(withIndex)) urlPath = (urlPath.endsWith('/') ? urlPath : urlPath + '/') + 'index.html';
        } catch (_) {}
      }
      const filePath = path.join(SITE_DIR, urlPath.replace(/^\//, ''));

      if (!filePath.startsWith(SITE_DIR)) {
        res.writeHead(403);
        res.end();
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          if (err.code === 'ENOENT') {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          res.writeHead(500);
          res.end(String(err));
          return;
        }
        const ext = path.extname(filePath);
        res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
        res.end(data);
      });
    });

    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function generatePdf() {
  const { chromium } = require('playwright');

  const server = await serveStatic(PORT);
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const cvUrl = baseUrl + CV_PATH;

  try {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(cvUrl, { waitUntil: 'networkidle' });
      await fs.promises.mkdir(OUT_DIR, { recursive: true });
      // Force print media and reinforce page-break rules (Chromium can ignore them on empty elements)
      await page.emulateMedia({ media: 'print' });
      await page.addStyleTag({
        content: `@media print { .cv-page-break-after { page-break-after: always !important; } }`,
      });
      await page.pdf({
        path: OUT_FILE,
        format: 'A4',
        printBackground: true,
        scale: 0.88,
        margin: { top: '0.5cm', right: '0.5cm', bottom: '0.5cm', left: '0.5cm' },
      });
      console.log('PDF written to', OUT_FILE);
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
}

async function main() {
  buildJekyll();
  await generatePdf();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
