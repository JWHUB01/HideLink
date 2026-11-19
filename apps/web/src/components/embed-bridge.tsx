'use client';

import { useEffect } from 'react';

import { setDarkShade, setTheme, type DarkShade, type Theme } from '@/lib/theme';

/**
 * The `postMessage` bridge between the widget and the page that embeds it.
 *
 * A fixed-height iframe clips the chat as soon as the conversation grows, and a
 * "one size fits all" height wastes half of the page when the user is only picking
 * filters. The bridge therefore reports the document's real height whenever it
 * changes, and accepts the host page's theme so the widget does not flash a white
 * panel inside a dark site.
 *
 * ## Protocol
 *
 * Widget → host (sent to `window.parent`, `targetOrigin` `*` because the host
 * origin is unknown; the payload carries nothing private):
 *   `{ source: 'anonlink-widget', type: 'ready', version: 1 }`
 *   `{ source: 'anonlink-widget', type: 'resize', height: number }`
 *
 * Host → widget (must carry `source: 'anonlink-host'`; anything else is ignored):
 *   `{ source: 'anonlink-host', type: 'theme', theme: 'light' | 'dark' }`
 *   `{ source: 'anonlink-host', type: 'shade', shade: 'default' | 'green' | 'purple' }`
 *
 * Theme and shade only change colours; no message can read data out of the frame or
 * perform an action on the user's behalf.
 */

const WIDGET_SOURCE = 'anonlink-widget';
const HOST_SOURCE = 'anonlink-host';
const PROTOCOL_VERSION = 1;

export function EmbedBridge() {
  useEffect(() => {
    // Rendered outside an iframe (direct visit): there is nobody to talk to.
    if (window.parent === window) return;

    const post = (message: Record<string, unknown>): void => {
      try {
        window.parent.postMessage({ source: WIDGET_SOURCE, ...message }, '*');
      } catch {
        // A host that navigated away mid-post is not this page's problem.
      }
    };

    const sendHeight = (): void => {
      post({ type: 'resize', height: Math.ceil(document.documentElement.scrollHeight) });
    };

    post({ type: 'ready', version: PROTOCOL_VERSION });
    sendHeight();

    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.documentElement);
    window.addEventListener('resize', sendHeight);

    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { source?: unknown; type?: unknown; theme?: unknown; shade?: unknown };
      if (typeof data !== 'object' || data === null || data.source !== HOST_SOURCE) return;

      if (data.type === 'theme' && (data.theme === 'light' || data.theme === 'dark')) {
        setTheme(data.theme as Theme);
      }

      if (
        data.type === 'shade' &&
        (data.shade === 'default' || data.shade === 'green' || data.shade === 'purple')
      ) {
        setDarkShade(data.shade as DarkShade);
      }
    };

    window.addEventListener('message', onMessage);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sendHeight);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return null;
}
