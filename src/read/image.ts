// Width and height of a scan, read from the file itself. ImageMagick is only the fallback for a
// format this does not know.

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

const PNG = [0x89, 0x50, 0x4e, 0x47] as const;

/** The size of a PNG or a JPEG. Anything else is refused, so the caller can ask ImageMagick. */
export function imageSize(bytes: Uint8Array): ImageSize {
  if (bytes.length >= 24 && PNG.every((byte, index) => bytes[index] === byte)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes);
  throw new Error("the image is neither a png nor a jpeg");
}

function jpegSize(bytes: Uint8Array): ImageSize {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === undefined) break;
    // A start-of-frame marker carries the size. Restart markers and the standalone ones have none.
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = view.getUint16(i + 2);
    if (length < 2) throw new Error("the jpeg is truncated");
    i += 2 + length;
  }
  throw new Error("the jpeg has no size");
}
