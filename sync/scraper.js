'use strict';
/**
 * LinkedIn scraper — pulls certifications, experience, and education
 * from your LinkedIn profile and saves them to linkedin-data.json.
 *
 * Required env vars (one of the two auth methods):
 *
 *   Cookie auth (recommended — avoids bot detection):
 *     LINKEDIN_COOKIES        JSON array exported from Cookie-Editor browser extension
 *
 *   Password auth (fallback):
 *     LINKEDIN_EMAIL          your LinkedIn login email
 *     LINKEDIN_PASSWORD       your LinkedIn password
 *
 *   LINKEDIN_PROFILE_SLUG     slug from your profile URL
 *                             e.g. "uma-maheshwar-reddy-manda-"
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const SLUG    = process.env.LINKEDIN_PROFILE_SLUG || 'uma-maheshwar-reddy-manda-';
const OUT     = path.join(__dirname, 'linkedin-data.json');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * ms * 0.25)));
}

// ── Login ────────────────────────────────────────────────────────────────────
async function login(ctx, page) {
  // ── Method 1: cookies (preferred, bypasses bot detection) ──
  if (process.env.LINKEDIN_COOKIES) {
    console.log('[scraper] loading session cookies…');
    let cookies;
    try {
      cookies = JSON.parse(process.env.LINKEDIN_COOKIES);
    } catch {
      throw new Error('LINKEDIN_COOKIES is not valid JSON');
    }
    // Playwright cookies need a domain field
    const normalized = cookies.map(c => ({
      ...c,
      domain: c.domain || '.linkedin.com',
      path:   c.path   || '/',
    }));
    await ctx.addCookies(normalized);
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    const loggedIn = await page.evaluate(() =>
      !window.location.href.includes('/login') && !window.location.href.includes('/authwall')
    );
    if (!loggedIn) throw new Error('Cookies are expired — re-export from your browser and update the LINKEDIN_COOKIES secret');
    console.log('[scraper] login ok (cookies)');
    return;
  }

  // ── Method 2: email + password ──
  console.log('[scraper] logging in with email/password…');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
  await sleep(1200);
  await page.fill('#username', process.env.LINKEDIN_EMAIL);
  await sleep(350);
  await page.fill('#password', process.env.LINKEDIN_PASSWORD);
  await sleep(500);
  await page.click('button[type="submit"]');
  await page.waitForURL(/linkedin\.com\/(feed|in\/|mynetwork|jobs|checkpoint)/, { timeout: 30000 });

  if (page.url().includes('checkpoint')) {
    throw new Error(
      'LinkedIn is asking for identity verification (CAPTCHA or email code). ' +
      'Switch to cookie-based auth: export cookies from your browser and add as LINKEDIN_COOKIES secret.'
    );
  }

  await sleep(2000);
  console.log('[scraper] login ok (password)');
}

// ── Page helper ──────────────────────────────────────────────────────────────
async function loadDetailPage(page, section) {
  const url = `https://www.linkedin.com/in/${SLUG}/details/${section}/`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);
  // scroll to trigger lazy-loads
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
}

// ── Certifications ───────────────────────────────────────────────────────────
async function scrapeCertifications(page) {
  await loadDetailPage(page, 'certifications');

  const certs = await page.evaluate(() => {
    const results = [];
    const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;

    const items = document.querySelectorAll(
      'li.pvs-list__paged-list-item, li[data-view-name="profile-component-entity"]'
    );

    items.forEach(item => {
      // Skip nested sub-lists (multi-role company blocks)
      if (item.closest('li.pvs-list__paged-list-item li')) return;

      const spans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(s => s.textContent.trim())
        .filter(Boolean);

      if (spans.length < 2) return;

      const name   = spans[0];
      const issuer = spans[1];

      const dateSpan = spans.find(
        (s, i) => i >= 2 && (MONTH_RE.test(s) || /\d{4}/.test(s))
      ) || '';
      const issuedDate = dateSpan.replace(/^issued\s*/i, '').split('·')[0].trim();

      // Prefer an external credential link
      const credentialUrl = Array.from(item.querySelectorAll('a[href]'))
        .map(a => a.href)
        .find(h => h.startsWith('http') && !h.includes('linkedin.com')) || '';

      if (name && issuer) {
        results.push({ name, issuer, issuedDate, credentialUrl });
      }
    });

    return results;
  });

  console.log(`[scraper] certifications: ${certs.length} found`);
  return certs;
}

// ── Experience ───────────────────────────────────────────────────────────────
async function scrapeExperience(page) {
  await loadDetailPage(page, 'experience');

  const raw = await page.evaluate(() => {
    const results = [];
    const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;

    const topItems = Array.from(
      document.querySelectorAll('li.pvs-list__paged-list-item, li[data-view-name="profile-component-entity"]')
    ).filter(li => !li.closest('li.pvs-list__paged-list-item li'));

    topItems.forEach(item => {
      const spans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(s => s.textContent.trim())
        .filter(Boolean);

      if (spans.length < 2) return;

      // Detect if this is a multi-role block (has inner list items)
      const innerItems = item.querySelectorAll('li.pvs-list__paged-list-item');
      const isCurrent  = item.querySelector('[data-test-is-current="true"], .pvs-entity__caption--active') !== null
                      || spans.some(s => /present/i.test(s));

      if (innerItems.length > 0) {
        // Multiple roles at same company
        const company = spans[0];
        const roles   = Array.from(innerItems).map(inner => {
          const iSpans = Array.from(inner.querySelectorAll('span[aria-hidden="true"]'))
            .map(s => s.textContent.trim()).filter(Boolean);
          const dateRange = iSpans.find(s => MONTH_RE.test(s) || /\d{4}/.test(s)) || '';
          return { title: iSpans[0] || '', dateRange, spans: iSpans };
        });
        results.push({ type: 'multi', company, isCurrent, roles });
      } else {
        const dateRange = spans.find(s => MONTH_RE.test(s) || /\d{4}/.test(s)) || '';
        results.push({ type: 'single', spans, isCurrent, dateRange });
      }
    });

    return results;
  });

  console.log(`[scraper] experience: ${raw.length} items found`);
  return raw;
}

// ── Education ────────────────────────────────────────────────────────────────
async function scrapeEducation(page) {
  await loadDetailPage(page, 'education');

  const edu = await page.evaluate(() => {
    const results = [];
    const items = Array.from(
      document.querySelectorAll('li.pvs-list__paged-list-item, li[data-view-name="profile-component-entity"]')
    ).filter(li => !li.closest('li.pvs-list__paged-list-item li'));

    items.forEach(item => {
      const spans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(s => s.textContent.trim()).filter(Boolean);
      if (spans.length < 2) return;
      const school = spans[0];
      const degree = spans[1] || '';
      const dates  = spans.find(s => /\d{4}/.test(s) && s !== school && s !== degree) || '';
      results.push({ school, degree, dates, rawSpans: spans });
    });
    return results;
  });

  console.log(`[scraper] education: ${edu.length} items found`);
  return edu;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.LINKEDIN_EMAIL || !process.env.LINKEDIN_PASSWORD) {
    console.error('[scraper] LINKEDIN_EMAIL and LINKEDIN_PASSWORD must be set');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
  });

  const page = await ctx.newPage();

  try {
    await login(ctx, page);
    const certifications = await scrapeCertifications(page);
    const experience     = await scrapeExperience(page);
    const education      = await scrapeEducation(page);

    const output = {
      scrapedAt: new Date().toISOString(),
      certifications,
      experience,
      education,
    };

    fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
    console.log(`[scraper] saved → ${OUT}`);
  } catch (err) {
    console.error('[scraper] fatal:', err.message);
    // Save screenshot for debugging
    await page.screenshot({ path: path.join(__dirname, 'error-screenshot.png') }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
