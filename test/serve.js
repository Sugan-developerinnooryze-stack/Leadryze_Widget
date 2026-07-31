// Zero-dependency static server for test/index.html — deliberately not
// `file://` (opening the HTML file directly). A file:// page sends no real
// Origin header, so the widget's own CORS check (which needs a real
// hostname to match against Allowed Domains) would always reject it. Serving
// over real HTTP, even just on localhost, is what makes the actual embed
// snippet — unmodified — work exactly the way it would on a real site.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const FILE = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  fs.readFile(FILE, (err, data) => {
    if (err) { res.writeHead(500); res.end('Could not read test/index.html'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Test page running at http://localhost:${PORT} — open this URL in your browser.`);
  console.log(`Make sure "localhost" is in the widget's Allowed Domains first, and that`);
  console.log(`test/index.html has your real widget key pasted in (not the placeholder).`);
});
