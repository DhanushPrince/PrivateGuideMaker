/**
 * export.js — PDF (print), HTML, and Markdown exporters for StepSafe
 */

// ─── Branding helpers ────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [Number.parseInt(h.slice(0,2),16), Number.parseInt(h.slice(2,4),16), Number.parseInt(h.slice(4,6),16)];
}

/** Darken a hex color by multiplying RGB by factor (0–1). */
function hexDarken(hex, f) {
  return '#' + hexToRgb(hex).map(v => Math.round(v * f).toString(16).padStart(2, '0')).join('');
}

/** Lighten a hex color by mixing with white at factor (0–1 = full white). */
function hexLighten(hex, f) {
  return '#' + hexToRgb(hex).map(v => Math.round(v + (255 - v) * f).toString(16).padStart(2, '0')).join('');
}

const DEFAULT_BRANDING = {
  brandColor: '#5D2E8C',
  brandName: 'Private Guide Maker',
  logoMark: 'PGM',
  tagline: 'Private guide recorder',
};

const CALLOUT_ICONS_HTML = {
  info:      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.5" r=".5" fill="currentColor"/></svg>',
  success:   '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><polyline points="7,10 9.5,12.5 13.5,7.5"/></svg>',
  warning:   '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L1.5 17h17z"/><line x1="10" y1="8" x2="10" y2="12"/><circle cx="10" cy="14.5" r=".5" fill="currentColor"/></svg>',
  danger:    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><line x1="7" y1="7" x2="13" y2="13"/><line x1="13" y1="7" x2="7" y2="13"/></svg>',
  important: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="10,2 12.5,7.5 18,8 14,12 15,17.5 10,15 5,17.5 6,12 2,8 7.5,7.5"/></svg>',
};
// ─── HTML Export ─────────────────────────────────────────────────────────────
//
// Produces a self-contained HTML file that mirrors the in-extension viewer:
// sticky left sidebar with numbered step nav, scrollable main column with
// hero (plus optional cover for captureOnStart), numbered step cards with
// red click circles overlaid via CSS, and a StepSafe footer. No edit
// controls — read-only. All CSS inlined, images as data URLs, a small
// vanilla JS blob handles scroll-spy, smooth-scroll and a lightbox.

export async function exportHTML(guide, steps, branding = {}) {
  downloadText(await buildHTML(guide, steps, branding), sanitizeFilename(guide.title) + '.html', 'text/html');
}

// PDF = the HTML export + its print stylesheet, via the browser's own
// "Save as PDF" print dialog. No PDF library.
export async function exportPDF(guide, steps, branding = {}) {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Pop-up blocked');
  w.document.write(await buildHTML(guide, steps, branding));
  w.document.close();
  await Promise.all([...w.document.images].map(img => img.decode().catch(() => {})));
  w.focus();
  w.print();
}

async function buildHTML(guide, steps, branding) {
  const b = { ...DEFAULT_BRANDING, ...branding };
  const colorPrimary      = b.brandColor;
  const colorPrimaryHover = hexDarken(b.brandColor, 0.8);
  const colorPrimaryLight = hexLighten(b.brandColor, 0.94);
  const colorPrimaryDark  = hexDarken(b.brandColor, 0.52);
  const [pr, pg, pb] = hexToRgb(b.brandColor);
  const shadowPrimary = `rgba(${pr},${pg},${pb},0.18)`;
  const glowPrimary   = `rgba(${pr},${pg},${pb},0.4)`;

  const hasRTL = steps.some(s => /[\u0600-\u06FF]/.test(s.description || ''));

  // Split cover (isInitialCapture) from action steps — matches viewer logic.
  // Find cover by flag, NOT by position, because the user might have
  // reordered or deleted it.
  const coverStep   = steps.find(s => s.isInitialCapture) || null;
  const actionSteps = steps.filter(s => !s.isInitialCapture);

  // Pre-compute natural dimensions for every action-step screenshot so
  // click circles can be positioned with inline percentage styles.
  const stepDims = await Promise.all(
    actionSteps.map(s => {
      const src = s.screenshotAnnotated || s.screenshotRaw;
      return src ? getImageNaturalSize(src) : Promise.resolve(null);
    })
  );

  const TYPE_TAG_LABELS = {
    click: 'Click', keystroke: 'Type', navigate: 'Go',
    text: 'Note', callout: 'Callout', heading: 'Heading',
  };

  const sidebarHtml = actionSteps.map((step, i) => {
    const type = step.type || 'click';
    const iconSvg = type === 'keystroke'
      ? '<svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="16" height="10" rx="2"/><path d="M5 9h.01M8 9h.01M11 9h.01M14 9h.01M5 12h10"/></svg>'
      : type === 'navigate'
      ? '<svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12M12 6l4 4-4 4"/></svg>'
      : '<svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l5.5 13 2.2-5.3L16 8.5z"/></svg>';
    return `
      <li>
        <button class="nav-item${i === 0 ? ' active' : ''}" data-idx="${i}">
          <div class="nav-num">${i + 1}</div>
          ${iconSvg}
          <span class="nav-text">${escapeHtml(step.description || `Step ${i + 1}`)}</span>
        </button>
      </li>`;
  }).join('');

  const stepsHtml = actionSteps.map((step, i) => {
    const type  = step.type || 'click';
    const dims  = stepDims[i];
    const src   = step.screenshotAnnotated || step.screenshotRaw;
    const isRTL = /[\u0600-\u06FF\u0590-\u05FF]/.test(step.description || '');
    const hasImage = !!src;

    // Click circle percentage coordinates (matches viewer.js logic)
    let circleHtml = '';
    const showCircle = (type === 'click' || type === 'keystroke')
                      && (step.clickX > 0 || step.clickY > 0)
                      && !step.screenshotAnnotated
                      && dims && dims.width && dims.height;
    if (showCircle) {
      const dpr = step.devicePixelRatio || 1;
      const px = step.clickX * dpr;
      const py = step.clickY * dpr;
      const leftPct = (px / dims.width)  * 100;
      const topPct  = (py / dims.height) * 100;
      circleHtml = `<div class="click-circle" style="left:${leftPct.toFixed(2)}%;top:${topPct.toFixed(2)}%"></div>`;
    }

    const imgHtml = hasImage
      ? `<div class="step-image">
           <img src="${escapeHtmlAttr(src)}" alt="Step ${i + 1} screenshot" loading="lazy" onclick="lb(this.src)">
           ${circleHtml}
         </div>`
      : '';

    const notesHtml = step.notes
      ? `<div class="step-notes">${escapeHtml(step.notes)}</div>`
      : '';

    const urlHtml = step.pageUrl
      ? `<div class="step-url">
           <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12l-2 2a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0"/><path d="M12 8l2-2a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0"/></svg>
           <a href="${escapeHtmlAttr(step.pageUrl)}" target="_blank" rel="noopener">${escapeHtml(step.pageUrl)}</a>
         </div>`
      : '';

    const classes = ['step-card', `type-${type}`];
    if (!hasImage) classes.push('text-only');
    if (type === 'navigate') classes.push('nav-step');
    const cVariant = step.calloutType || 'warning';
    if (type === 'callout') classes.push(`callout-${cVariant}`);

    const showCalloutIcon = type === 'callout' && step.calloutShowIcon !== false;
    const numberInner = showCalloutIcon ? CALLOUT_ICONS_HTML[cVariant] || String(i + 1) : String(i + 1);

    return `
      <section class="${classes.join(' ')}" id="step-${i}" data-idx="${i}">
        <div class="step-head">
          <div class="step-number${showCalloutIcon ? ' has-icon' : ''}">${numberInner}</div>
          <div class="step-desc"${isRTL ? ' dir="rtl"' : ''}>${escapeHtml(step.description || `Step ${i + 1}`)}</div>
          <span class="step-type-tag type-${type}">${TYPE_TAG_LABELS[type] || 'Step'}</span>
        </div>
        ${notesHtml}
        ${imgHtml}
        ${urlHtml}
      </section>`;
  }).join('\n');

  // Hero cover (only when a cover step exists)
  let heroCoverHtml = '';
  if (coverStep) {
    const coverSrc = coverStep.screenshotAnnotated || coverStep.screenshotRaw;
    heroCoverHtml = coverSrc
      ? `<div class="hero-cover"><img src="${escapeHtmlAttr(coverSrc)}" alt="Starting page"></div>`
      : `<div class="hero-cover no-image">${escapeHtml(coverStep.description || 'Starting page')}</div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="${hasRTL ? 'ar' : 'en'}"${hasRTL ? ' dir="rtl"' : ''}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(guide.title)}</title>
  <style>
    :root {
      --color-primary: ${colorPrimary};
      --color-primary-hover: ${colorPrimaryHover};
      --color-primary-light: ${colorPrimaryLight};
      --color-primary-dark: ${colorPrimaryDark};
      --color-accent-gradient: linear-gradient(90deg,#46abf8,#9995fd 20%,#d679e7 40%,#f96ba1 60%,#ff734a 80%,#ffa056);
      --color-click: #e11d48;
      --color-click-glow: rgba(225, 29, 72, 0.35);
      --color-text: #1a1433;
      --color-text-muted: #6b6585;
      --color-border: #ece7f3;
      --color-bg: #ffffff;
      --color-bg-alt: #faf8fc;
      --radius-md: 10px;
      --radius-lg: 16px;
      --shadow-sm: 0 1px 2px rgba(26, 20, 51, 0.04), 0 1px 3px rgba(26, 20, 51, 0.06);
      --shadow-md: 0 10px 30px -10px ${shadowPrimary}, 0 4px 10px -4px rgba(26, 20, 51, 0.08);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: var(--color-bg-alt);
      color: var(--color-text);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      scrollbar-gutter: stable;
    }

    /* ── Topbar ──────────────────────────────────────────── */
    .topbar {
      position: sticky; top: 0; z-index: 20;
      display: flex; align-items: center; gap: 12px;
      padding: 0 24px; height: 60px;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: saturate(180%) blur(14px);
      -webkit-backdrop-filter: saturate(180%) blur(14px);
      border-bottom: 1px solid var(--color-border);
    }
    .logo-mark {
      height: 32px; border-radius: 9px;
      background: var(--color-primary); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: 12px; flex-shrink: 0;
      box-shadow: 0 4px 12px -4px ${glowPrimary};
      flex-shrink: 0;
    }
    .topbar-title {
      flex: 1; min-width: 0;
      font-size: 16px; font-weight: 700; color: var(--color-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* ── Layout ─────────────────────────────────────────── */
    .layout {
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 24px;
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }

    /* ── Sidebar ────────────────────────────────────────── */
    .sidebar {
      position: sticky; top: 84px; align-self: start;
      height: calc(100vh - 108px);
      overflow: hidden;
      display: flex; flex-direction: column;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
    }
    .sidebar-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px 12px;
      border-bottom: 1px solid var(--color-border);
    }
    .sidebar-title {
      font-size: 11px; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--color-text-muted);
    }
    .sidebar-count {
      font-size: 11px; font-weight: 700;
      color: var(--color-primary);
      background: var(--color-primary-light);
      padding: 2px 9px; border-radius: 99px;
    }
    .steps-nav {
      flex: 1; overflow-y: auto;
      list-style: none; padding: 8px; margin: 0;
      display: flex; flex-direction: column; gap: 3px;
    }
    .steps-nav::-webkit-scrollbar { width: 6px; }
    .steps-nav::-webkit-scrollbar-track { background: transparent; }
    .steps-nav::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 3px; }
    .nav-item {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 9px 12px;
      font-size: 12px; font-family: inherit;
      color: var(--color-text-muted);
      background: transparent; border: none;
      border-radius: 8px; cursor: pointer;
      text-align: left; line-height: 1.45;
      transition: background 0.15s, color 0.15s;
      width: 100%;
    }
    .nav-item:hover { background: var(--color-bg-alt); color: var(--color-text); }
    .nav-item.active {
      background: var(--color-primary-light);
      color: var(--color-primary);
      font-weight: 600;
    }
    .nav-num {
      flex-shrink: 0; width: 20px; height: 20px;
      border-radius: 50%;
      background: var(--color-bg-alt);
      color: var(--color-text-muted);
      font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid var(--color-border);
    }
    .nav-item.active .nav-num {
      background: var(--color-primary); color: #fff;
      border-color: var(--color-primary);
    }
    .nav-text {
      flex: 1; min-width: 0;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .nav-icon {
      flex-shrink: 0; width: 14px; height: 14px;
      color: var(--color-text-muted);
      margin-top: 3px;
    }
    .nav-item.active .nav-icon { color: var(--color-primary); }

    /* ── Content ────────────────────────────────────────── */
    .content { min-width: 0; }
    .hero {
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: 32px 36px;
      margin-bottom: 20px;
      box-shadow: var(--shadow-sm);
      position: relative;
      overflow: hidden;
    }
    .hero::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 4px;
      background: var(--color-accent-gradient);
    }
    .hero-title {
      font-size: 28px; font-weight: 800;
      color: var(--color-text);
      letter-spacing: -0.02em;
      line-height: 1.2;
    }
    .hero-meta {
      font-size: 13px;
      color: var(--color-text-muted);
      margin-top: 10px;
      display: flex; align-items: center; gap: 14px;
      flex-wrap: wrap;
    }
    .hero-meta .dot {
      width: 3px; height: 3px; border-radius: 50%;
      background: var(--color-text-muted); opacity: 0.6;
    }
    .hero-cover {
      margin-top: 22px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--color-border);
      background: var(--color-bg-alt);
      box-shadow: 0 12px 28px -12px rgba(93, 46, 140, 0.22);
      position: relative;
    }
    .hero-cover img {
      display: block; width: 100%; height: auto;
      max-height: 360px;
      object-fit: cover; object-position: top center;
      cursor: zoom-in;
    }
    .hero-cover.no-image {
      padding: 32px 24px;
      text-align: center;
      color: var(--color-text-muted);
      font-size: 14px;
    }
    .hero-cover::before {
      content: 'STARTING HERE';
      position: absolute;
      top: 14px; left: 14px;
      background: rgba(255, 255, 255, 0.95);
      color: var(--color-primary);
      font-size: 10px; font-weight: 800;
      letter-spacing: 0.08em;
      padding: 4px 10px;
      border-radius: 99px;
      backdrop-filter: blur(6px);
      z-index: 2;
    }

    /* ── Step cards ─────────────────────────────────────── */
    .steps { display: flex; flex-direction: column; gap: 20px; padding-bottom: 40px; }
    .step-card {
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-sm);
      transition: box-shadow 0.2s, border-color 0.2s;
      scroll-margin-top: 84px;
    }
    .step-card:hover {
      box-shadow: var(--shadow-md);
      border-color: var(--color-primary-light);
    }
    .step-head {
      display: flex; align-items: center; gap: 14px;
      padding: 18px 22px 14px;
    }
    .step-number {
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--color-primary); color: #fff;
      font-size: 13px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 4px 12px -4px ${glowPrimary};
    }
    .step-desc {
      flex: 1;
      font-size: 17px; font-weight: 600;
      color: var(--color-text);
      line-height: 1.4;
      word-break: break-word;
    }
    .step-desc[dir="rtl"] { text-align: right; }
    .step-type-tag {
      font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.06em;
      padding: 3px 8px; border-radius: 99px;
      flex-shrink: 0;
    }
    .step-type-tag.type-click     { background: #fff1f3; color: #c11337; }
    .step-type-tag.type-keystroke { background: #eef5ff; color: #2166c4; }
    .step-type-tag.type-navigate  { background: #f3edfa; color: #5D2E8C; }
    .step-type-tag.type-text      { background: var(--color-bg-alt); color: var(--color-text-muted); }
    .step-type-tag.type-callout   { background: #fef3c7; color: #b45309; }
    .step-type-tag.type-heading   { background: #dbeafe; color: #1d4ed8; }
    .step-notes {
      padding: 4px 22px 12px 68px;
      font-size: 14px;
      color: var(--color-text-muted);
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .step-image {
      position: relative;
      margin: 0 22px 18px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--color-border);
      background: var(--color-bg-alt);
    }
    .step-image img {
      display: block; width: 100%; height: auto;
      cursor: zoom-in;
    }

    /* Pulsing red click circle — positioned via inline % coords */
    .click-circle {
      position: absolute;
      width: 44px; height: 44px;
      border: 3px solid var(--color-click);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      box-shadow: 0 0 0 3px #fff, 0 0 18px 4px var(--color-click-glow);
      animation: click-pulse 2.4s ease-in-out infinite;
    }
    @keyframes click-pulse {
      0%, 100% {
        box-shadow: 0 0 0 3px #fff, 0 0 18px 4px var(--color-click-glow);
        transform: translate(-50%, -50%) scale(1);
      }
      50% {
        box-shadow: 0 0 0 3px #fff, 0 0 28px 8px rgba(225, 29, 72, 0.5);
        transform: translate(-50%, -50%) scale(1.08);
      }
    }

    .step-url {
      padding: 0 22px 16px;
      font-size: 12px;
      color: var(--color-text-muted);
      display: flex; align-items: center; gap: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .step-url a { color: var(--color-text-muted); text-decoration: none; word-break: break-all; }
    .step-url a:hover { color: var(--color-primary); text-decoration: underline; }

    /* Special step types */
    .step-card.type-heading {
      background: transparent;
      border: none; box-shadow: none;
      padding: 8px 0 0;
      margin-top: 8px;
    }
    .step-card.type-heading .step-head {
      padding: 8px 0 6px;
      border-bottom: 2px solid var(--color-border);
      gap: 10px;
    }
    .step-card.type-heading .step-number { display: none; }
    .step-card.type-heading .step-desc {
      font-size: 22px; font-weight: 800;
      color: var(--color-text);
      letter-spacing: -0.015em;
    }
    .step-card.type-heading .step-type-tag { display: none; }
    .step-card.type-callout.callout-info      { background: linear-gradient(135deg, #eff6ff, #fff); border-color: #bfdbfe; border-left: 4px solid #3b82f6; }
    .step-card.type-callout.callout-success   { background: linear-gradient(135deg, #f0fdf4, #fff); border-color: #bbf7d0; border-left: 4px solid #22c55e; }
    .step-card.type-callout.callout-warning   { background: linear-gradient(135deg, #fffbeb, #fff); border-color: #fde68a; border-left: 4px solid #f59e0b; }
    .step-card.type-callout.callout-danger    { background: linear-gradient(135deg, #fef2f2, #fff); border-color: #fecaca; border-left: 4px solid #ef4444; }
    .step-card.type-callout.callout-important { background: linear-gradient(135deg, #faf5ff, #fff); border-color: #ddd6fe; border-left: 4px solid #8b5cf6; }
    .step-card.type-callout.callout-info      .step-number { background: #3b82f6; }
    .step-card.type-callout.callout-success   .step-number { background: #22c55e; }
    .step-card.type-callout.callout-warning   .step-number { background: #f59e0b; }
    .step-card.type-callout.callout-danger    .step-number { background: #ef4444; }
    .step-card.type-callout.callout-important .step-number { background: #8b5cf6; }
    .step-card.type-callout .step-number { box-shadow: none; }
    .step-card.type-callout .step-number.has-icon { display: flex; align-items: center; justify-content: center; }
    .step-card.type-callout .step-number.has-icon svg { width: 16px; height: 16px; color: #fff; }
    .step-card.type-callout.callout-info      .step-type-tag { background: #dbeafe; color: #1d4ed8; }
    .step-card.type-callout.callout-success   .step-type-tag { background: #dcfce7; color: #15803d; }
    .step-card.type-callout.callout-warning   .step-type-tag { background: #fef3c7; color: #b45309; }
    .step-card.type-callout.callout-danger    .step-type-tag { background: #fee2e2; color: #dc2626; }
    .step-card.type-callout.callout-important .step-type-tag { background: #ede9fe; color: #6d28d9; }
    .step-card.nav-step {
      background: linear-gradient(135deg, #faf8fc, #ffffff);
    }
    .step-card.text-only .step-head { padding: 22px; }

    /* ── Footer ─────────────────────────────────────────── */
    .footer {
      margin-top: 32px;
      padding: 24px 0;
      border-top: 1px solid var(--color-border);
      display: flex; align-items: center; justify-content: center;
    }
    .footer-brand { display: flex; align-items: center; gap: 12px; }
    .footer-logo {
      height: 34px; border-radius: 9px; flex-shrink: 0;
      background: var(--color-primary); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: 12px;
    }
    .footer-name { font-size: 13px; font-weight: 700; color: var(--color-text); }
    .footer-tagline { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }

    /* ── Lightbox ───────────────────────────────────────── */
    #lb {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(10, 7, 22, 0.92);
      z-index: 9999;
      align-items: center;
      justify-content: center;
      cursor: zoom-out;
      padding: 16px;
    }
    #lb.open { display: flex; }
    #lb img {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 8px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.6);
      object-fit: contain;
      pointer-events: none;
    }
    #lb-close {
      position: fixed;
      top: 16px; right: 20px;
      color: #fff;
      font-size: 28px;
      line-height: 1;
      cursor: pointer;
      opacity: 0.7;
      border: none;
      background: none;
      padding: 6px 10px;
      border-radius: 8px;
    }
    #lb-close:hover { opacity: 1; background: rgba(255,255,255,0.08); }

    /* ── Responsive ─────────────────────────────────────── */
    @media print {
      .topbar, .sidebar, #lb { display: none !important; }
      .layout { display: block; padding: 0; }
      .step-card { break-inside: avoid; box-shadow: none; }
      body { background: #fff; }
    }
    @media (max-width: 880px) {
      .layout { grid-template-columns: 1fr; }
      .sidebar {
        position: static;
        height: auto;
        max-height: 40vh;
      }
      .hero-title { font-size: 22px; }
      .hero { padding: 24px 20px; }
    }
    @media (max-width: 600px) {
      .layout { padding: 16px; gap: 16px; }
      .step-head { padding: 16px 18px 12px; }
      .step-image { margin: 0 18px 16px; }
      .step-notes { padding-left: 58px; padding-right: 18px; }
    }
  </style>
</head>
<body>

  <!-- Topbar -->
  <header class="topbar">
    ${b.logoImage
      ? `<img src="${b.logoImage}" style="height:32px;width:auto;max-width:140px;object-fit:contain;display:block" alt="${escapeHtmlAttr(b.brandName)}">`
      : `<div class="logo-mark" style="min-width:32px;padding:0 6px">${escapeHtml(b.logoMark)}</div>`}
    <h1 class="topbar-title">${escapeHtml(guide.title)}</h1>
  </header>

  <!-- Main layout -->
  <div class="layout">

    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-head">
        <span class="sidebar-title">Steps</span>
        <span class="sidebar-count">${actionSteps.length}</span>
      </div>
      <ol class="steps-nav">
        ${sidebarHtml}
      </ol>
    </aside>

    <!-- Content -->
    <main class="content">
      <div class="hero">
        <h2 class="hero-title">${escapeHtml(guide.title)}</h2>
        ${guide.description ? `<p class="hero-desc" style="font-size:15px;color:#6b6585;line-height:1.5;margin:8px 0 0;">${escapeHtml(guide.description)}</p>` : ''}
        <div class="hero-meta">
          <span>${actionSteps.length} step${actionSteps.length === 1 ? '' : 's'}</span>
          <span class="dot"></span>
          <span>Exported ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span class="dot"></span>
          <span>Made with ${escapeHtml(b.brandName)}</span>
        </div>
        ${heroCoverHtml}
      </div>

      <div class="steps">
        ${stepsHtml || '<div style="padding:72px 24px;text-align:center;color:var(--color-text-muted);">No actionable steps in this guide.</div>'}
      </div>

      <footer class="footer">
        <div class="footer-brand">
          ${b.logoImage
            ? `<img src="${b.logoImage}" style="height:34px;width:auto;max-width:120px;object-fit:contain;display:block" alt="${escapeHtmlAttr(b.brandName)}">`
            : `<div class="footer-logo" style="min-width:34px;padding:0 6px">${escapeHtml(b.logoMark)}</div>`}
          <div>
            <span class="footer-name">Made with Private Guide Maker</span>
            <div class="footer-tagline">${escapeHtml(b.tagline)}</div>
          </div>
        </div>
      </footer>
    </main>
  </div>

  <!-- Lightbox -->
  <div id="lb" onclick="closeLb()">
    <button id="lb-close" onclick="closeLb()" title="Close (Esc)">&#x2715;</button>
    <img id="lb-img" src="" alt="Full-size screenshot">
  </div>

  <script>
    // Lightbox — click any screenshot to zoom
    function lb(src) {
      document.getElementById('lb-img').src = src;
      document.getElementById('lb').classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeLb() {
      document.getElementById('lb').classList.remove('open');
      document.getElementById('lb-img').src = '';
      document.body.style.overflow = '';
    }
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeLb(); });

    // Hero cover click → lightbox
    (function () {
      var coverImg = document.querySelector('.hero-cover img');
      if (coverImg) coverImg.addEventListener('click', function () { lb(coverImg.src); });
    })();

    // Sidebar → smooth-scroll to the matching card
    document.querySelectorAll('.nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = btn.getAttribute('data-idx');
        var target = document.getElementById('step-' + idx);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // Scroll-spy: highlight the nav item whose card is currently in view
    (function () {
      var navItems = Array.prototype.slice.call(document.querySelectorAll('.nav-item'));
      var cards    = Array.prototype.slice.call(document.querySelectorAll('.step-card'));
      if (!cards.length || !('IntersectionObserver' in window)) return;
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var idx = entry.target.getAttribute('data-idx');
            navItems.forEach(function (el) { el.classList.remove('active'); });
            var match = navItems.find(function (el) { return el.getAttribute('data-idx') === idx; });
            if (match) {
              match.classList.add('active');
              match.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
          }
        });
      }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
      cards.forEach(function (c) { observer.observe(c); });
    })();
  </script>

</body>
</html>`;

  return html;
}

// Return { width, height } of an image data URL, or null on failure.
function getImageNaturalSize(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ─── Markdown Export ─────────────────────────────────────────────────────────

export function exportMarkdown(guide, allSteps) {
  // Same numbering as the viewer / HTML / PDF: the starting screenshot (isInitialCapture) is an
  // unnumbered cover, and only the remaining steps are numbered.
  const coverStep = allSteps.find(s => s.isInitialCapture) || null;
  const steps = allSteps.filter(s => !s.isInitialCapture);
  const lines = [
    `# ${guide.title}`,
    '',
  ];
  if (guide.description) {
    lines.push(guide.description, '');
  }
  lines.push(
    `> ${steps.length} step${steps.length !== 1 ? 's' : ''} · Exported ${new Date().toLocaleDateString()}`,
    '',
    '---',
    '',
  );
  if (coverStep) {
    lines.push(`**${coverStep.description || 'Starting page'}**`, '');
    const coverImg = coverStep.screenshotAnnotated || coverStep.screenshotRaw;
    if (coverImg) lines.push(`![Starting page](${coverImg})`, '');
    lines.push('---', '');
  }
  const CALLOUT_MD = { info: 'ℹ️', success: '✅', warning: '⚠️', danger: '🚨', important: '⭐' };
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const type = step.type || 'click';
    if (type === 'callout') {
      const variant = step.calloutType || 'warning';
      const emoji = CALLOUT_MD[variant] || '💡';
      lines.push(`> ${emoji} **${step.description || ''}**`);
    } else if (type === 'heading') {
      lines.push(`## ${step.description || ''}`);
    } else {
      lines.push(`## Step ${i + 1}: ${step.description || ''}`);
    }
    lines.push('');
    if (step.notes) {
      lines.push(step.notes);
      lines.push('');
    }
    const img = step.screenshotAnnotated || step.screenshotRaw;
    if (img) lines.push(`![Step ${i + 1}](${img})`, '');
    if (step.pageUrl) {
      lines.push(`**Page:** [${escapeMarkdown(step.pageTitle || step.pageUrl)}](${step.pageUrl})`);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }
  lines.push('<sub>Made with Private Guide Maker</sub>', '');
  downloadText(lines.join('\n'), sanitizeFilename(guide.title) + '.md', 'text/markdown');
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function downloadText(content, filename, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_').slice(0, 80) || 'guide';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeHtmlAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeMarkdown(str) {
  return String(str).replace(/[[\]()]/g, '\\$&');
}
