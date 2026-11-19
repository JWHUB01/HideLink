import { ErrorCode } from '@anonlink/shared';
import type { ClientToServerEvents, ServerToClientEvents } from '@anonlink/protocol';
import { io, type Socket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';

import { http } from './support/api-client.js';
import { TEST_API_URL } from './support/test-env.js';

/**
 * Sessions for the embedded widget (`/embed`).
 *
 * The widget runs in an iframe on somebody else's page, where the `HttpOnly` session
 * cookie is third-party storage the browser refuses to send. The contract therefore
 * has three parts, and each of them is a way to get this wrong:
 *
 *  - the token is issued in the response body and **no cookie is set** (otherwise the
 *    surrounding page could borrow a session for the API origin);
 *  - the same token authenticates REST (`Authorization`) and the socket handshake
 *    (`auth.token`), exactly as the cookie does for the standalone site;
 *  - rotation revokes the old token, so the widget's "new User ID" is as final as the
 *    main application's.
 */

interface EmbedSessionBody {
  session: { publicId: string };
  token: string;
}

interface CurrentSessionBody {
  authenticated: boolean;
  session: { publicId: string } | null;
}

interface ErrorBody {
  error: { code: string };
}

/** Opens an embed session and returns its body. */
async function bootstrapEmbed(): Promise<EmbedSessionBody> {
  const result = await http<EmbedSessionBody>('/session/embed', { method: 'POST' });
  expect(result.status).toBe(201);
  return result.body;
}

/** The bearer header the widget sends on every REST call. */
function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

describe('embedded widget sessions', () => {
  it('issues a token in the body and sets no cookie', async () => {
    const result = await http<EmbedSessionBody>('/session/embed', { method: 'POST' });

    expect(result.status).toBe(201);
    expect(result.body.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(result.body.session.publicId).toMatch(/^AL[0-9A-Z]{12}$/);

    // The whole point: a cookie would be third-party storage on the embedder's page,
    // and one issued for the API origin could be borrowed by the page around the frame.
    expect(result.setCookie).toEqual([]);
  });

  it('authenticates REST with the bearer token', async () => {
    const issued = await bootstrapEmbed();

    const current = await http<CurrentSessionBody>('/session', {
      headers: bearer(issued.token),
    });

    expect(current.status).toBe(200);
    expect(current.body.authenticated).toBe(true);
    expect(current.body.session?.publicId).toBe(issued.session.publicId);
  });

  it('returns the same identity and token while the token is valid', async () => {
    const issued = await bootstrapEmbed();

    const again = await http<EmbedSessionBody>('/session/embed', {
      method: 'POST',
      headers: bearer(issued.token),
    });

    // Idempotent, like `POST /session` with a cookie: a widget reload must not mint a
    // new anonymous identity on every page view.
    expect(again.status).toBe(201);
    expect(again.body.token).toBe(issued.token);
    expect(again.body.session.publicId).toBe(issued.session.publicId);
  });

  it('rotates the token and revokes the previous one', async () => {
    const issued = await bootstrapEmbed();

    const rotated = await http<EmbedSessionBody>('/session/embed', {
      method: 'DELETE',
      headers: bearer(issued.token),
    });

    expect(rotated.status).toBe(200);
    expect(rotated.body.token).not.toBe(issued.token);
    expect(rotated.body.session.publicId).not.toBe(issued.session.publicId);

    // The old token no longer authenticates anything, and a protected route says so
    // with the same code a missing session gets.
    const old = await http<ErrorBody>(`/users/${rotated.body.session.publicId}`, {
      headers: bearer(issued.token),
    });
    expect(old.status).toBe(401);
    expect(old.body.error.code).toBe(ErrorCode.IDENTITY_REQUIRED);

    // The new one does.
    const fresh = await http<{ publicId: string; exists: boolean }>(
      `/users/${rotated.body.session.publicId}`,
      { headers: bearer(rotated.body.token) },
    );
    expect(fresh.status).toBe(200);
    expect(fresh.body.publicId).toBe(rotated.body.session.publicId);
  });

  it('authenticates the socket handshake with the token', async () => {
    const issued = await bootstrapEmbed();

    type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
    const socket: RealtimeSocket = io(TEST_API_URL, {
      transports: ['websocket'],
      auth: { token: issued.token },
      reconnection: false,
      forceNew: true,
      autoConnect: false,
    });

    const ready = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('session:ready never arrived')), 10_000);
      socket.on('session:ready', (payload) => {
        clearTimeout(timer);
        resolve(payload.publicId);
      });
      socket.on('connect_error', (error) => {
        clearTimeout(timer);
        reject(new Error(`connect_error: ${error.message}`));
      });
    });

    try {
      socket.connect();
      await expect(ready).resolves.toBe(issued.session.publicId);
    } finally {
      socket.removeAllListeners();
      socket.disconnect();
    }
  });
});
