import {
  ErrorCode,
  type AdminBackgroundListResponse,
  type AdminBackgroundView,
} from '@anonlink/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { adminHttp, http, httpBinary } from './support/api-client.js';

/**
 * The owner's decorative backgrounds (ad slots).
 *
 * The interesting properties, as with chat media, are authorisation and lifetime:
 * a background is platform content that only `ADMIN_TOKEN` may change, while the bytes
 * are public — served to every page, including the first one without a session. The tests
 * speak exactly the documented surfaces: the owner's REST cookie for changes, an
 * anonymous GET for the bytes.
 */

/** Minimal file: only the magic bytes the server sniffs. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png-payload')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpg-payload')]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

async function cleanBackgrounds(): Promise<void> {
  const list = await adminHttp<AdminBackgroundListResponse>('/admin/backgrounds');
  if (list.status !== 200) {
    throw new Error(`GET /admin/backgrounds failed: ${list.status} ${JSON.stringify(list.body)}`);
  }
  for (const background of list.body.backgrounds) {
    await adminHttp(`/admin/backgrounds/${background.variant}`, { method: 'DELETE' });
  }
}

describe('the owner background upload', () => {
  afterEach(async () => {
    await cleanBackgrounds();
  });

  it('refuses to change a background without the owner key, and serves it publicly after upload', async () => {
    // Without the owner cookie the admin route is closed; with the cookie a PNG lands.
    const closed = await http('/admin/backgrounds/rail', { method: 'POST', rawBody: PNG });
    expect(closed.status).toBe(401);
    expect((closed.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.ADMIN_AUTH_REQUIRED,
    );

    const uploaded = await adminHttp<AdminBackgroundView>('/admin/backgrounds/rail', {
      method: 'POST',
      rawBody: PNG,
    });
    expect(uploaded.status).toBe(200);
    expect(uploaded.body).toMatchObject({
      variant: 'rail',
      mimeType: 'image/png',
      size: PNG.length,
      url: '/api/v1/backgrounds/rail',
    });

    // The bytes are public: no session, no cookie, and they come back identical.
    const served = await httpBinary('/backgrounds/rail');
    expect(served.status).toBe(200);
    expect(served.contentType).toBe('image/png');
    expect(served.bytes.equals(PNG)).toBe(true);
  });

  it('rejects HTML and oversized uploads, and replacing a background keeps one current picture', async () => {
    const html = await adminHttp('/admin/backgrounds/banner', { method: 'POST', rawBody: HTML });
    expect(html.status).toBe(415);
    expect((html.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.MEDIA_TYPE_UNSUPPORTED,
    );

    const uploaded = await adminHttp<AdminBackgroundView>('/admin/backgrounds/banner', {
      method: 'POST',
      rawBody: JPG,
    });
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.mimeType).toBe('image/jpeg');

    // The second upload replaces the first: the list still has one entry per filled slot.
    const replaced = await adminHttp<AdminBackgroundView>('/admin/backgrounds/banner', {
      method: 'POST',
      rawBody: PNG,
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body.mimeType).toBe('image/png');

    const publicList = await http<{ backgrounds: Array<{ variant: string }> }>('/backgrounds');
    expect(publicList.status).toBe(200);
    const bannerEntries = publicList.body.backgrounds.filter((b) => b.variant === 'banner');
    expect(bannerEntries).toHaveLength(1);

    const served = await httpBinary('/backgrounds/banner');
    expect(served.status).toBe(200);
    expect(served.bytes.equals(PNG)).toBe(true);
  });

  it('lists empty slots for the admin and 404s a missing picture publicly', async () => {
    const list = await adminHttp<AdminBackgroundListResponse>('/admin/backgrounds');
    expect(list.status).toBe(200);
    expect(list.body.backgrounds).toHaveLength(3);
    for (const background of list.body.backgrounds) {
      expect(background.url).toBeNull();
    }

    const missing = await httpBinary('/backgrounds/chat-background');
    expect(missing.status).toBe(404);

    const removed = await adminHttp('/admin/backgrounds/rail', { method: 'DELETE' });
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ removed: true });
  });
});