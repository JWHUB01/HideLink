import type { Metadata } from 'next';

import { EmbedBridge } from '@/components/embed-bridge';
import { HomeScreen } from '@/components/home-screen';

/**
 * The embeddable widget.
 *
 * The same application, served at a path that `src/proxy.ts` allows other sites to
 * frame (`frame-ancestors`). The session is a bearer token kept in this frame's
 * `sessionStorage` instead of the `HttpOnly` cookie, because a cookie would be
 * third-party storage here and browsers refuse to send it.
 *
 * Not indexed: a copy of the product behind an `iframe` tag has no business competing
 * with the real page in search results.
 */
export const metadata: Metadata = {
  title: 'AnonLink — анонимный чат',
  robots: { index: false, follow: false },
};

export default function EmbedPage() {
  return (
    <>
      <EmbedBridge />
      <HomeScreen />
    </>
  );
}
