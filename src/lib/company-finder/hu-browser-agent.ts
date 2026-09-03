/**
 * Hungarian Browser Automation Agent
 * Updated for @sparticuz/chromium (Vercel serverless optimized)
 */

import type { Browser, Page } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const EBESZAMOLO_BASE = 'https://e-beszamolo.im.gov.hu';
const SEARCH_URL = `${EBESZAMOLO_BASE}/oldal/kereses_merleglista`;

export interface HuSearchResult {
  success: boolean;
  companyId?: string;
  companyName?: string;
  documentUrl?: string;
  documentTitle?: string;
  error?: string;
}

export class HuBrowserAgent {
  private browser: Browser | null = null;

  async searchCompany(companyName: string): Promise<HuSearchResult> {
    const puppeteer = await import('puppeteer-core');
    
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    try {
      const page = await browser.newPage();
      await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: 60000 });
      
      await page.type('input[name="firmName"]', companyName, { delay: 50 });
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2' });

      const results = await page.evaluate(() => {
        const items = document.querySelectorAll('.result-item, .search-result');
        return Array.from(items).map(el => ({
          name: el.textContent?.trim(),
          url: el.querySelector('a')?.href,
        }));
      });

      return {
        success: results.length > 0,
        companyName: results[0]?.name,
        documentUrl: results[0]?.url,
      };
    } finally {
      await browser.close();
    }
  }
}

export function getHuAgent() {
  return new HuBrowserAgent();
}
