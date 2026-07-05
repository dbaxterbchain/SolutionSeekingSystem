import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Submits every sitemap URL to IndexNow (Bing, Yandex, etc.) after a
 * successful production deploy. Never fails the build — indexing pings are
 * best-effort.
 */

const KEY = 'e75a2aa1ea8b473e96f4789568cff858';
const HOST = 'www.solutionseeking.com';

export const onSuccess = async ({ constants, utils }) => {
  if (process.env.CONTEXT !== 'production') {
    console.log('IndexNow: skipping non-production deploy.');
    return;
  }

  try {
    const xml = await readFile(join(constants.PUBLISH_DIR, 'sitemap-0.xml'), 'utf8');
    const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    if (urlList.length === 0) {
      console.warn('IndexNow: no URLs found in sitemap, nothing submitted.');
      return;
    }

    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: `https://${HOST}/${KEY}.txt`,
        urlList,
      }),
    });

    utils.status.show({
      title: 'IndexNow',
      summary: `Submitted ${urlList.length} URLs to IndexNow (HTTP ${res.status}).`,
    });
  } catch (err) {
    console.warn(`IndexNow submission skipped: ${err.message}`);
  }
};
