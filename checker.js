import { chromium } from 'playwright';
import nodemailer from 'nodemailer';
import 'dotenv/config';

async function getSessionCookie(browser) {
  const page = await browser.newPage();
  await page.goto('https://www.marram.co.nz/user/login');
  
  await page.getByLabel('Username (Email Address)').fill(process.env.MARRAM_EMAIL);
  await page.getByPlaceholder("password").fill(process.env.MARRAM_PASSWORD);
    

  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForLoadState('networkidle');

  // Extract cookies from the browser session
  const cookies = await page.context().cookies();
  await page.close();
  return cookies;
}

async function checkAvailability(cookies) {
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  const url = 'https://www.marram.co.nz/api/availability.json?' + new URLSearchParams({
    'tx_holidayhomes_api[args][id_list]': '59.01,59.02,59.03,59.04',
    'tx_holidayhomes_api[args][start_date]': '05022027',
    'tx_holidayhomes_api[args][end_date]': '08022027',
  });

  const response = await fetch(url, {
    headers: { Cookie: cookieHeader }
  });

  return await response.json();
}

async function sendAlert(unitIds) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: '🏠 Marram Christchurch Available!',
    text: `Units available for 05-08 Feb 2027: ${unitIds.join(', ')}\n\nBook now at https://www.marram.co.nz/#/`,
  });
}

async function main() {
  const browser = await chromium.launch({ headless: false });

  try {
    const cookies = await getSessionCookie(browser);
    const data = await checkAvailability(cookies);

    const requiredDates = ['2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08'];

    const availableUnits = data.filter(unit =>
      requiredDates.every(date =>
        unit.Availability.some(a => a.startsWith(date))
      )
    );

    if (availableUnits.length > 0) {
      const unitIds = availableUnits.map(u => u.ID);
      console.log('Available! Sending alert for:', unitIds);
      await sendAlert(unitIds);
    } else {
      console.log('Still fully booked.');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();