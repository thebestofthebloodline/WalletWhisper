/**
 * Simple deterministic identicon generator.
 * Takes a wallet address and returns an SVG data URL with a 4x4 grid pattern.
 */

function hashAddress(address: string): number[] {
  const hashes: number[] = [];
  let h = 0;
  for (let i = 0; i < address.length; i++) {
    h = ((h << 5) - h + address.charCodeAt(i)) | 0;
    if (i % 4 === 3) {
      hashes.push(Math.abs(h));
      h = 0;
    }
  }
  // Ensure we have enough values
  while (hashes.length < 20) {
    h = ((h << 5) - h + hashes.length * 7) | 0;
    hashes.push(Math.abs(h));
  }
  return hashes;
}

function hslColor(hue: number, sat: number, light: number): string {
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/**
 * Generate an SVG identicon for the given wallet address.
 * Returns a data URL string suitable for use as an img src.
 */
export function generateIdenticon(address: string, size = 40): string {
  const hashes = hashAddress(address);

  // Primary hue derived from the address
  const hue1 = hashes[0] % 360;
  const hue2 = (hue1 + 137) % 360; // golden angle offset
  const bgColor = hslColor(hue1, 30, 15);
  const fgColor1 = hslColor(hue1, 70, 55);
  const fgColor2 = hslColor(hue2, 60, 50);

  const cellSize = size / 4;
  let rects = '';

  // Generate a 4x4 grid, but mirror horizontally (columns 0-1 mirror to 3-2)
  // This creates a more pleasing, symmetric pattern.
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 2; col++) {
      const idx = row * 2 + col;
      const filled = hashes[idx + 2] % 3 !== 0; // ~66% fill rate
      if (filled) {
        const color = hashes[idx + 2] % 2 === 0 ? fgColor1 : fgColor2;
        const x1 = col * cellSize;
        const x2 = (3 - col) * cellSize;
        const y = row * cellSize;

        rects += `<rect x="${x1}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${color}" />`;
        rects += `<rect x="${x2}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${color}" />`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${bgColor}" rx="4" />
    ${rects}
  </svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Generate a small inline SVG string (not data URL) for embedding.
 */
export function generateIdenticonSvg(address: string, size = 40): string {
  const hashes = hashAddress(address);

  const hue1 = hashes[0] % 360;
  const hue2 = (hue1 + 137) % 360;
  const bgColor = hslColor(hue1, 30, 15);
  const fgColor1 = hslColor(hue1, 70, 55);
  const fgColor2 = hslColor(hue2, 60, 50);

  const cellSize = size / 4;
  let rects = '';

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 2; col++) {
      const idx = row * 2 + col;
      const filled = hashes[idx + 2] % 3 !== 0;
      if (filled) {
        const color = hashes[idx + 2] % 2 === 0 ? fgColor1 : fgColor2;
        const x1 = col * cellSize;
        const x2 = (3 - col) * cellSize;
        const y = row * cellSize;

        rects += `<rect x="${x1}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${color}" />`;
        rects += `<rect x="${x2}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${color}" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${bgColor}" rx="4" />
    ${rects}
  </svg>`;
}
