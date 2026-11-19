import { deflateSync } from 'node:zlib';

import { expect, test } from '@playwright/test';

import { newIdentity } from '../support/app';
import { openOwnerPage, resetBackgrounds, signIn } from '../support/owner';

/**
 * The owner's decorative backgrounds for the advertising slots.
 *
 * The uploading side is a real browser file picker, and the seeing side is the public
 * page every visitor sees: the same page that will later hold a creative. The spec
 * uploads a background for the side rail and then checks the rail on a *plain* visitor
 * page — the proof that the picture is content, not admin-only state.
 */

/** A real, decodable 2×2 PNG, so the browser can render it as a CSS background. */
function tinyPng(): Buffer {
  const width = 2;
  const height = 2;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const pixel = row + 1 + x * 4;
      raw[pixel] = 180;
      raw[pixel + 1] = 80;
      raw[pixel + 2] = 40;
      raw[pixel + 3] = 255;
    }
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let value = n;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[n] = value >>> 0;
    }
    return table;
  })();

  const crc32 = (bytes: Buffer): number => {
    let value = 0xffffffff;
    for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  };

  const chunk = (type: string, data: Buffer): Buffer => {
    const typeBytes = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
    return Buffer.concat([length, typeBytes, data, checksum]);
  };

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test.describe('the owner background upload', () => {
  test.afterEach(async () => {
    await resetBackgrounds();
  });

  test('uploads a background in the admin page and the rail shows it to visitors', async ({
    browser,
  }) => {
    const owner = await openOwnerPage(browser);
    await signIn(owner.page);

    // The section starts with no picture for the rail.
    const railRow = owner.page.locator('li', { hasText: 'Боковая колонка' });
    await expect(railRow.getByText('Загрузить', { exact: true })).toBeVisible();
    await expect(railRow.getByRole('button', { name: 'Убрать', exact: true })).toHaveCount(0);

    // A real PNG through the real file picker. The upload control is a label wrapping a
    // file input, so it is found by text and clicked through the file chooser.
    const chooser = owner.page.waitForEvent('filechooser');
    await railRow.getByText('Загрузить', { exact: true }).click();
    (await chooser).setFiles({ name: 'rail.png', mimeType: 'image/png', buffer: tinyPng() });

    // The upload lands: the row now has a preview and an "Убрать" button.
    await expect(railRow.getByRole('img', { name: 'Текущий фон: Боковая колонка' })).toBeVisible();
    await expect(railRow.getByRole('button', { name: 'Убрать', exact: true })).toBeVisible();

    // A fresh visitor — no owner key, no session — sees the rail filled with the picture.
    const visitor = await newIdentity(browser);
    const rail = visitor.page.locator('[data-ad-rail="left"] [data-ad-slot="rail"]');
    await expect(rail).toHaveAttribute('data-ad-background', 'image');
    await expect(rail).toHaveCSS('background-image', /url\("http:\/\/localhost:3201\/api\/v1\/backgrounds\/rail/);

    await owner.context.close();
    await visitor.context.close();
  });
});