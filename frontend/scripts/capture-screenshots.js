/**
 * Playwright Screenshot Capture Script
 * 
 * Captures real app screenshots for the landing page.
 * 
 * Usage:
 *   1. Start the app: npm run dev (frontend) + backend server
 *   2. Run: node scripts/capture-screenshots.js
 * 
 * Requires: npm install playwright @playwright/test
 */

const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'public', 'screenshots');
const BASE_URL = 'http://localhost:3000';
const VIEWPORT = { width: 1280, height: 800 };

// Test credentials (update with actual demo account)
const TEST_USER = {
  email: process.env.TEST_USER_EMAIL || 'demo@stylesense.ai',
  password: process.env.TEST_USER_PASSWORD || 'demo123456',
};

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input[type="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  console.log('✓ Logged in successfully');
}

async function captureScreenshot(page, name, options = {}) {
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({
    path: filePath,
    fullPage: false,
    ...options,
  });
  console.log(`✓ Captured: ${name}.png`);
}

async function captureWardrobeGrid(page) {
  await page.goto(`${BASE_URL}/wardrobe`);
  await page.waitForSelector('[class*="grid"]', { timeout: 10000 });
  // Wait for images to load
  await page.waitForTimeout(2000);
  await captureScreenshot(page, 'wardrobe-grid');
}

async function captureSelfieUpload(page) {
  await page.goto(`${BASE_URL}/settings`);
  // Wait for the face photos section
  await page.waitForTimeout(1500);
  await captureScreenshot(page, 'selfie-upload');
}

async function captureWardrobe_url(page) {
  await page.goto(`${BASE_URL}/wardrobe`);
  await page.waitForSelector('[class*="grid"]', { timeout: 10000 });
  await page.waitForTimeout(1000);
  
  // Click "Add item" button to open modal
  const addButton = await page.$('button:has-text("Add"), button:has-text("ADD")');
  if (addButton) {
    await addButton.click();
    await page.waitForTimeout(500);
  }
  await captureScreenshot(page, 'wardrobe-url');
}

async function captureStudioTryon(page) {
  await page.goto(`${BASE_URL}/studio`);
  await page.waitForTimeout(2000);
  await captureScreenshot(page, 'studio-tryon');
}

async function captureStudioVideo(page) {
  await page.goto(`${BASE_URL}/studio`);
  await page.waitForTimeout(2000);
  // Look for video player or animate controls
  await captureScreenshot(page, 'studio-video');
}

async function captureStudioScene(page) {
  await page.goto(`${BASE_URL}/studio`);
  await page.waitForTimeout(2000);
  await captureScreenshot(page, 'studio-scene');
}

async function captureStylistChat(page) {
  await page.goto(`${BASE_URL}/stylist`);
  await page.waitForTimeout(2000);
  await captureScreenshot(page, 'stylist-chat');
}

async function captureDashboard(page) {
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForTimeout(2000);
  await captureScreenshot(page, 'dashboard');
}

async function main() {
  console.log('Starting Playwright screenshot capture...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // Retina quality
  });
  const page = await context.newPage();
  
  try {
    // Login first
    await login(page);
    
    // Capture all screenshots
    console.log('\nCapturing screenshots...');
    await captureWardrobeGrid(page);
    await captureSelfieUpload(page);
    await captureWardrobe_url(page);
    await captureStudioTryon(page);
    await captureStudioVideo(page);
    await captureStudioScene(page);
    await captureStylistChat(page);
    await captureDashboard(page);
    
    console.log('\n✓ All screenshots captured successfully!');
    console.log(`  Location: ${SCREENSHOTS_DIR}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
