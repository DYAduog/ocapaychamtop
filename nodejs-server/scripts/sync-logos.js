const fs = require('fs');
const path = require('path');

const imgDir = path.join(__dirname, '..', 'public', 'images');

// 1. Embed TPBank PNG into tpbank.svg
const tpbBuf = fs.readFileSync(path.join(imgDir, 'tpbank.png'));
const tpbBase64 = tpbBuf.toString('base64');
const tpbSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 447 447" width="100%" height="100%">
  <clipPath id="rounded">
    <rect width="447" height="447" rx="80" ry="80"/>
  </clipPath>
  <g clip-path="url(#rounded)">
    <image width="447" height="447" href="data:image/png;base64,${tpbBase64}" preserveAspectRatio="xMidYMid meet"/>
  </g>
</svg>`;
fs.writeFileSync(path.join(imgDir, 'tpbank.svg'), tpbSvg, 'utf8');
console.log('Updated tpbank.svg successfully (size:', tpbSvg.length, ')');

// 2. Embed Timo PNG into timo.svg
const timoBuf = fs.readFileSync(path.join(imgDir, 'timo.png'));
const timoBase64 = timoBuf.toString('base64');
const timoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 682" width="100%" height="100%">
  <rect width="1024" height="682" rx="60" ry="60" fill="#ffffff"/>
  <image width="1024" height="682" href="data:image/png;base64,${timoBase64}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
fs.writeFileSync(path.join(imgDir, 'timo.svg'), timoSvg, 'utf8');
console.log('Updated timo.svg successfully (size:', timoSvg.length, ')');
