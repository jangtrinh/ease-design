// Hidden-iframe render host for HTML_TO_FIGMA: renders arbitrary HTML via
// srcdoc at a given width, waits for runtime styles (Tailwind CDN etc.),
// then walks the rendered DOM into a FigmaExportPayload.
// Runs in the plugin UI iframe — pure DOM, no Figma Plugin API here.

import type { FigmaExportPayload } from '../../../shared/figma-payload-types';
import { buildPayloadFromIframe, waitForStylesReady } from './converter/extract';

const IFRAME_LOAD_TIMEOUT_MS = 10_000;
const DEFAULT_RENDER_HEIGHT_PX = 4000; // tall viewport; real height comes from scrollHeight

/** Wait for the iframe 'load' event (srcdoc parse + subresource kickoff). */
function waitForIframeLoad(iframe: HTMLIFrameElement, html: string): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, IFRAME_LOAD_TIMEOUT_MS); // proceed anyway
    iframe.addEventListener('load', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    iframe.srcdoc = html;
  });
}

/**
 * Render `html` at `width` px in an offscreen iframe and convert the rendered
 * DOM into a FigmaExportPayload named `name`.
 *
 * The iframe is positioned offscreen — NOT display:none / visibility:hidden,
 * because both would poison getComputedStyle for every descendant and the
 * walker skips visibility:hidden elements.
 */
export async function renderHtmlToPayload(
  html: string,
  width: number,
  name: string,
): Promise<FigmaExportPayload> {
  if (!html || typeof html !== 'string') {
    throw new Error('renderHtmlToPayload: html must be a non-empty string');
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'absolute';
  iframe.style.left = '-100000px';
  iframe.style.top = '0';
  iframe.style.width = `${width}px`;
  iframe.style.height = `${DEFAULT_RENDER_HEIGHT_PX}px`;
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  try {
    await waitForIframeLoad(iframe, html);
    await waitForStylesReady(iframe);

    if (!iframe.contentDocument || !iframe.contentWindow) {
      throw new Error('render iframe has no document — srcdoc blocked by sandbox?');
    }

    // buildPayloadFromIframe → prepareDocForExtraction + walk + tokens
    return buildPayloadFromIframe(iframe, name, width);
  } finally {
    // Always tear the hidden iframe down, even when extraction throws
    iframe.remove();
  }
}
