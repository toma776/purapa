// Dimensiunile unei imagini, citite din antetul fișierului (PNG, JPEG, WebP), fără dependențe.
// Cu lățimea și înălțimea în <img>, pagina nu „sare” la încărcare.
export function imageSize(buf) {
  if (!buf || buf.length < 30) return null;
  if (buf.readUInt32BE(0) === 0x89504e47) return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)};
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return {height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7)};
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') return {width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff};
    if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return {width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1}; }
    if (chunk === 'VP8X') return {width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1};
  }
  return null;
}
