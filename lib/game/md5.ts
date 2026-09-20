/**
 * MD5 of a string, as 32 hex characters.
 *
 * Here for one reason: Wikimedia files its thumbnails under the first two hex
 * characters of the MD5 of the filename (see `thumbUrl` in `feed.ts`), and
 * `SubtleCrypto` does not do MD5. RFC 1321, over the UTF-8 bytes of the text.
 * Nothing in the game hashes anything else, and nothing here is security.
 */

/** Per-round left-rotation amounts. */
const SHIFT = new Int32Array([
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
  14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15,
  21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]);

/** Per-round constants: floor(|sin(i + 1)| * 2^32). */
const K = new Int32Array(64);
for (let i = 0; i < 64; i += 1) {
  K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0;
}

export function md5(text: string): string {
  const bytes = new TextEncoder().encode(text);
  // One 0x80 byte, zeros, then the bit length as 64 bits, to a 64 byte boundary.
  const padded = Math.ceil((bytes.length + 9) / 64) * 64;
  const buffer = new Uint8Array(padded);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;
  const view = new DataView(buffer.buffer);
  const bits = bytes.length * 8;
  view.setUint32(padded - 8, bits >>> 0, true);
  view.setUint32(padded - 4, Math.floor(bits / 2 ** 32), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476;
  const m = new Int32Array(16);

  for (let offset = 0; offset < padded; offset += 64) {
    for (let i = 0; i < 16; i += 1) m[i] = view.getInt32(offset + i * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const shift = SHIFT[i] as number;
      const sum = (a + f + (K[i] as number) + (m[g] as number)) | 0;
      const rotated = (sum << shift) | (sum >>> (32 - shift));
      a = d;
      d = c;
      c = b;
      b = (b + rotated) | 0;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  const out = new DataView(new ArrayBuffer(16));
  out.setInt32(0, a0, true);
  out.setInt32(4, b0, true);
  out.setInt32(8, c0, true);
  out.setInt32(12, d0, true);
  let hex = "";
  for (let i = 0; i < 16; i += 1) hex += out.getUint8(i).toString(16).padStart(2, "0");
  return hex;
}
