'use strict';
/**
 * Reads linkedin-data.json produced by scraper.js and appends any
 * NEW certifications/experience entries to index.html.
 *
 * Strategy: append-only — existing hand-crafted content is never touched.
 * Only items whose name does not already appear between the SYNC markers
 * are added.
 */
const fs   = require('fs');
const path = require('path');

const HTML_FILE = path.join(__dirname, '..', 'index.html');
const DATA_FILE = path.join(__dirname, 'linkedin-data.json');

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getMarkers(html, tag) {
  const open  = `<!-- SYNC:${tag}:START -->`;
  const close = `<!-- SYNC:${tag}:END -->`;
  const si    = html.indexOf(open);
  const ei    = html.indexOf(close);
  if (si === -1 || ei === -1) return null;
  return { si, ei, open, close, content: html.slice(si + open.length, ei) };
}

function replaceSection(html, tag, newContent) {
  const m = getMarkers(html, tag);
  if (!m) return html;
  return html.slice(0, m.si + m.open.length) + newContent + html.slice(m.ei);
}

// ── Certifications ───────────────────────────────────────────────────────────
function renderCertCard(cert, delay) {
  const delayStyle = delay > 0 ? ` style="transition-delay:${(delay * 0.1).toFixed(1)}s"` : '';
  const credLink = cert.credentialUrl
    ? `\n          <a class="cert-link" href="${esc(cert.credentialUrl)}" target="_blank">View Certificate →</a>`
    : '';
  // Generate a sensible placeholder description if LinkedIn doesn't supply one
  const desc = esc(cert.description || `Completed the ${cert.name} program issued by ${cert.issuer}.`);

  return `
        <div class="cert-card"${delayStyle}>
          <div class="cert-issuer">${esc(cert.issuer.toUpperCase())}</div>
          <div class="cert-title">${esc(cert.name)}</div>
          <div class="cert-body">${desc}</div>${credLink}
        </div>`;
}

function syncCertifications(html, certs) {
  const m = getMarkers(html, 'CERTIFICATIONS');
  if (!m) {
    console.warn('[update] SYNC:CERTIFICATIONS markers missing — skipping');
    return html;
  }

  // Extract names already present (case-insensitive)
  const existing = new Set(
    [...m.content.matchAll(/class="cert-title">([^<]+)</g)]
      .map(r => r[1].trim().toLowerCase())
  );

  const toAdd = certs.filter(c => !existing.has(c.name.trim().toLowerCase()));

  if (toAdd.length === 0) {
    console.log('[update] certifications — no new items');
    return html;
  }

  console.log(`[update] certifications — adding ${toAdd.length}: ${toAdd.map(c => c.name).join(', ')}`);

  const existingCount = [...m.content.matchAll(/class="cert-card"/g)].length;
  const newCards = toAdd.map((c, i) => renderCertCard(c, existingCount + i)).join('');

  return replaceSection(html, 'CERTIFICATIONS', m.content.trimEnd() + newCards + '\n      ');
}

// ── Experience ───────────────────────────────────────────────────────────────
function renderExperienceBlock(item) {
  // For scraped "single" items we have spans[0]=title, spans[1]=company, etc.
  // We render a minimal block; the user can enrich it with bullets later.
  const isSingle  = item.type === 'single';
  const company   = isSingle ? (item.spans[1] || item.spans[0]) : item.company;
  const title     = isSingle ? item.spans[0] : (item.roles?.[0]?.title || '');
  const dateRange = item.dateRange || (isSingle ? item.spans.find(s => /\d{4}/.test(s)) || '' : '');
  const empType   = isSingle
    ? (item.spans.find(s => /full.time|part.time|contract|freelance/i.test(s)) || 'Full-time')
    : 'Full-time';

  const currentBadge = item.isCurrent ? `
            <span class="we-current-badge" title="Current Employer">
              <span class="we-ping"></span>
              <span class="we-core"></span>
            </span>` : '';

  return `
        <!-- ── ${esc(company)} (auto-synced) ── -->
        <div class="we-company-block">
          <div class="we-company-row">
            <div class="we-co-icon-wrap"><span class="we-co-dot"></span></div>
            <h3 class="we-co-name">${esc(company)}</h3>${currentBadge}
          </div>
          <div class="we-positions-wrap">
            <div class="we-pos" data-we-open="true">
              <button class="we-trigger" onclick="weToggle(this)">
                <div class="we-trigger-row">
                  <div class="we-pos-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                  </div>
                  <span class="we-pos-title">${esc(title)}</span>
                  <span class="we-chevron"></span>
                </div>
                <div class="we-trigger-meta">
                  <span>${esc(empType)}</span>
                  <span class="we-v-sep"></span>
                  <span>${esc(dateRange)}</span>
                </div>
              </button>
              <div class="we-content">
                <ul class="we-bullets">
                  <li><!-- TODO: add bullet points from LinkedIn --></li>
                </ul>
                <div class="we-skills"></div>
              </div>
            </div>
          </div>
        </div>`;
}

function syncExperience(html, experience) {
  const m = getMarkers(html, 'EXPERIENCE');
  if (!m) {
    console.warn('[update] SYNC:EXPERIENCE markers missing — skipping');
    return html;
  }

  // Extract company names already in the HTML
  const existing = new Set(
    [...m.content.matchAll(/class="we-co-name">([^<]+)</g)]
      .map(r => r[1].trim().toLowerCase())
  );

  const toAdd = experience.filter(item => {
    const company = item.type === 'single' ? (item.spans[1] || item.spans[0]) : item.company;
    return company && !existing.has(company.trim().toLowerCase());
  });

  if (toAdd.length === 0) {
    console.log('[update] experience — no new items');
    return html;
  }

  console.log(`[update] experience — adding ${toAdd.length} new company block(s)`);
  const newBlocks = toAdd.map(renderExperienceBlock).join('');

  return replaceSection(html, 'EXPERIENCE', m.content.trimEnd() + newBlocks + '\n\n      ');
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error('[update] linkedin-data.json not found — run scraper.js first');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  let html   = fs.readFileSync(HTML_FILE, 'utf-8');
  const orig = html;

  html = syncCertifications(html, data.certifications || []);
  html = syncExperience(html, data.experience || []);

  if (html !== orig) {
    fs.writeFileSync(HTML_FILE, html, 'utf-8');
    console.log('[update] index.html updated ✓');
  } else {
    console.log('[update] no changes — index.html is already up to date');
  }
}

main();
