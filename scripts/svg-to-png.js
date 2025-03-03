const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../public/app-icon.svg');
const pngPath = path.join(__dirname, '../public/app-icon.png');

// Read the SVG file
const svgBuffer = fs.readFileSync(svgPath);

// Convert SVG to PNG at 512x512
sharp(svgBuffer)
  .resize(512, 512)
  .png()
  .toFile(pngPath)
  .then(() => {
    console.log('Generated base PNG icon');
  })
  .catch(err => {
    console.error('Error generating base PNG icon:', err);
  }); 