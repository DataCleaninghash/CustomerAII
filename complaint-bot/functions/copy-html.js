const fs = require('fs');
const path = require('path');

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
}

// Copy test.html to dist directory
const sourceFile = path.join(__dirname, 'src', 'test.html');
const destFile = path.join(distDir, 'test.html');

fs.copyFileSync(sourceFile, destFile);
console.log('Copied test.html to dist directory'); 