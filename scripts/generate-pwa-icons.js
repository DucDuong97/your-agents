const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outputDir = path.join(__dirname, '../public/icons');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate icons for each size
Promise.all(sizes.map(size => {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 79, g: 70, b: 229, alpha: 1 } // #4F46E5
    }
  })
  .composite([{
    input: Buffer.from(`
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" rx="${size/4}" fill="#4F46E5"/>
        <path d="M${size*0.75} ${size*0.28125}H${size*0.25}C${size*0.224} ${size*0.28125} ${size*0.203125} ${size*0.302} ${size*0.203125} ${size*0.328125}V${size*0.578125}C${size*0.203125} ${size*0.604} ${size*0.224} ${size*0.625} ${size*0.25} ${size*0.625}H${size*0.4375}L${size*0.5} ${size*0.71875}L${size*0.5625} ${size*0.625}H${size*0.75}C${size*0.776} ${size*0.625} ${size*0.796875} ${size*0.604} ${size*0.796875} ${size*0.578125}V${size*0.328125}C${size*0.796875} ${size*0.302} ${size*0.776} ${size*0.28125} ${size*0.75} ${size*0.28125}Z" fill="white"/>
      </svg>
    `),
    top: 0,
    left: 0
  }])
  .toFile(path.join(outputDir, `icon-${size}x${size}.png`))
  .then(() => {
    console.log(`Generated ${size}x${size} icon`);
  })
  .catch(err => {
    console.error(`Error generating ${size}x${size} icon:`, err);
  });
})); 