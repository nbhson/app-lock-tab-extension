// This is a helper file to generate simple icons
// Run: node icons/icons.js

const fs = require('fs');
const path = require('path');

function createPNG(size) {
  // Create a simple SVG and convert conceptually
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size*0.2}" fill="#2c3e50"/>
    <rect x="${size*0.2}" y="${size*0.35}" width="${size*0.6}" height="${size*0.5}" rx="${size*0.05}" fill="#e74c3c"/>
    <circle cx="${size*0.5}" cy="${size*0.65}" r="${size*0.08}" fill="#fff"/>
    <rect x="${size*0.45}" y="${size*0.65}" width="${size*0.1}" height="${size*0.15}" fill="#fff"/>
    <circle cx="${size*0.5}" cy="${size*0.25}" r="${size*0.1}" fill="none" stroke="#e74c3c" stroke-width="${size*0.04}"/>
  </svg>`;
  
  fs.writeFileSync(path.join(__dirname, `icon${size}.svg`), svg);
  console.log(`Created icon${size}.svg`);
}

[16, 48, 128].forEach(createPNG);
console.log('Icons created. Convert SVGs to PNGs for production use.');