/* print-actions.js — print, savePDF, exclusion
 * Browser-native APIs only. No canvas PDF.
 */
(function (global) {
  'use strict';

  // -------- print --------
  function doPrint() {
    // Chrome 86+ supports { silent: false }; user must confirm unless --kiosk-printing.
    // We always invoke window.print() and let user confirm.
    try {
      window.print();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  // -------- save PDF --------
  /** Open the system print dialog with "Save as PDF" target.
   *  Cross-platform: most modern browsers (Chrome / Edge / Firefox) expose a
   *  "Save as PDF" virtual printer in window.print().
   *  We additionally offer a data-URL trick: read the document as a blob
   *  and feed it to a hidden <a download> for environments that block print().
   *  Returns {ok, method}.
   */
  async function savePDF() {
    // Method A: native print-to-PDF (Chrome/Edge show "Save as PDF" target).
    try {
      window.print();
      return { ok: true, method: 'native-print' };
    } catch (e) {
      // Method B: serialize rendered DOM as text blob (best-effort fallback).
      try {
        const html = '<!doctype html>' + document.documentElement.outerHTML;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (document.title || 'quotation') + '.html';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        return { ok: true, method: 'html-fallback' };
      } catch (e2) {
        return { ok: false, error: String(e2 && e2.message || e2) };
      }
    }
  }

  // -------- exclusion --------
  /** Add .excluded to paper elements whose page number is NOT in `selected`. */
  function excludePages(paperEls, selectedSet) {
    if (!Array.isArray(paperEls)) return 0;
    let count = 0;
    paperEls.forEach(function (el, idx) {
      const p = idx + 1;
      if (!selectedSet.has(p)) {
        el.classList.add('excluded');
        count++;
      } else {
        el.classList.remove('excluded');
      }
    });
    return count;
  }

  /** Clear all exclusions. */
  function clearExclusions(paperEls) {
    if (!Array.isArray(paperEls)) return;
    paperEls.forEach(function (el) { el.classList.remove('excluded'); });
  }

  // -------- close --------
  function doClose() {
    try { window.close(); } catch (e) { /* ignore */ }
    try { window.postMessage({ type: 'print-close' }, '*'); } catch (e) { /* ignore */ }
  }

  // -------- export --------
  global.PrintActions = Object.freeze({
    print: doPrint,
    savePDF: savePDF,
    excludePages: excludePages,
    clearExclusions: clearExclusions,
    close: doClose
  });
})(typeof window !== 'undefined' ? window : globalThis);