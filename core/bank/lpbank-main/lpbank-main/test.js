const puppeteer = require('puppeteer');
const { remote } = require('webdriverio');

const sleep = async (time) =>
  await new Promise((resolve) => setTimeout(resolve, time));

const capabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:deviceName': '192.168.1.7:5555',
  'appium:udid': '192.168.1.7:5555',
  'appium:appPackage': 'vn.com.lpb.lienviet24h',
  'appium:appActivity': 'com.lpb.lienviet24h.ui.splash.SplashActivity',
  'appium:noReset': true, // Sửa ở đây
};

const wdOpts = {
  hostname: '127.0.0.1',
  port: 5000,
  logLevel: 'info',
  capabilities,
};

const keyCodes = {
  0: 7,
  1: 8,
  2: 9,
  3: 10,
  4: 11,
  5: 12,
  6: 13,
  7: 14,
  8: 15,
  9: 16,
};

async function pressKeySequence(client, sequence) {
  for (const char of sequence) {
    const keyCode = keyCodes[char];
    await checkNotify(client);
    await client.pressKeyCode(keyCode);
  }
}

const checkNotify = async (driver) => {
  const isNotify = await driver.$(`//*[@text="Đóng"]`).isExisting();
  if (isNotify === true) {
    const closeBtn = await driver.$(`//*[@text="Đóng"]`);
    await closeBtn.waitForExist({ timeout: 60000 });
    await closeBtn.click();
  }
};

puppeteer.launch({ headless: false }).then(async (browser) => {
  const driver = await remote(wdOpts);

  const page = await browser.newPage();
  await page.goto('https://ebanking.lpbank.com.vn/dashboard');
  const username = await page.waitForSelector('input[id="username"]');
  await username?.type('', { delay: 100 });
  await sleep(2000);
  const password = await page.waitForSelector('input[id="password"]');
  await password?.type('', { delay: 100 });

  //   const captchaImageSelector = "input[id='captcha']"; // Thay thế bằng selector của hình ảnh CAPTCHA
  //   const captchaImage = await page.$(captchaImageSelector);
  //   const captchaImagePath = "captcha.png";
  //   await captchaImage.screenshot({ path: captchaImagePath });
  //   const processedCaptchaImagePath = "captcha_processed.png";
  //   await preprocessImage(captchaImagePath, processedCaptchaImagePath);

  //   const captchaText = await solveCaptcha(processedCaptchaImagePath);
  //   const captchaInput = await page.waitForSelector('input[name="captcha"]');
  //   await captchaInput.type(captchaText, { delay: 100 });
  await page.waitForSelector('[data-accountno]', { timeout: 120000 });
  await page.evaluate(() => {
    let listAccts = document.querySelectorAll('[data-accountno]');
    for (let i = 0; i < listAccts.length; i++) {
      listAccts[i].click();
    }
  });

  let listAccount = await page.evaluate(() => {
    const table4 = document.querySelectorAll(
      'div[class="__table_version_4"]',
    )[3];
    const listRow = table4.querySelectorAll('table > tbody > tr');
    const listAccount = [];
    for (const row of listRow) {
      const accountCell = row
        ?.querySelectorAll('td')[0]
        .querySelector('a > span')?.textContent;
      const balanceCell = row
        ?.querySelectorAll('td')[3]
        .querySelector('a > span')?.textContent;

      if (Number(balanceCell?.replace(/,/g, '')) > 1000) {
        listAccount.push({
          account: accountCell || '',
          balance: Number(balanceCell?.replace(/,/g, '')) || 0,
        });
      }
    }
    return listAccount;
  });

  const batteryItem = await driver.$('//*[@text="Đăng nhập"]');
  await batteryItem.waitForExist({ timeout: 60000 });
  await batteryItem.click();

  await driver.pause(3000);
  const passwordElement = await driver.$(
    '//*[@resource-id="vn.com.lpb.lienviet24h:id/et_password"]',
  );
  await passwordElement.waitForExist();
  await passwordElement.setValue('Ngocpro!23');

  const loginBtn = await driver.$(
    '//*[@resource-id="vn.com.lpb.lienviet24h:id/btnLogin"]',
  );
  const isExistBtnLogin = await loginBtn.isExisting();
  if (isExistBtnLogin) {
    await loginBtn.click();
  }

  await driver.pause(20000);
  const isNotify = await driver
    .$(
      `//android.widget.Button[@resource-id="vn.com.lpb.lienviet24h:id/btn_cancel"]`,
    )
    .isExisting();
  if (isNotify === true) {
    console.log('Have notify');

    const closeBtn = await driver.$(
      `//android.widget.Button[@resource-id="vn.com.lpb.lienviet24h:id/btn_cancel"]`,
    );
    await closeBtn.waitForExist({ timeout: 60000 });
    await closeBtn.click();
  }

  await page.goto('https://ebanking.lpbank.com.vn/transfer/m2lpb/');

  const selectSource = await page.waitForSelector('select[id="source"]');
  const listAvailableAccount = await page.evaluate(() => {
    // Chọn select element và lấy option thứ 2
    const selectElement = document.querySelector('select[id="source"]');
    const availableAccountList = [];
    for (const option of selectElement.options) {
      availableAccountList.push(option.value);
    }
    return availableAccountList;
  });

  const availableMap = {};

  listAvailableAccount.forEach((account) => {
    availableMap[account] = 1;
  });

  console.log('Length before: ', listAccount.length);
  listAccount = listAccount.filter((data) => availableMap[data.account] === 1);
  console.log('Length after: ', listAccount.length);

  listAccount.sort((a, b) => Number(b.balance) - Number(a.balance));

  const receiveAcc = await page.evaluate(() => {
    // Chọn select element và lấy option thứ 2
    const selectElement = document.querySelector('select[id="source"]');
    const secondOption = selectElement.options[1]; // Chỉ mục 1 là option thứ 2
    return secondOption.value; // Trả về giá trị của option thứ 2
  });

  await selectSource?.select(receiveAcc);

  await sleep(3000);
  const balance = await page.waitForSelector('input[id="load_balance"]');
  const currentBalance = await page.$eval(
    'input[id="load_balance"]',
    (el) => el.value,
  );

  console.log(currentBalance);

  let isFirstRun = true;
  while (listAccount.length > 0) {
    const selectSource = await page.waitForSelector('select[id="source"]');
    const receiveAcc = await page.evaluate(() => {
      // Chọn select element và lấy option thứ 2
      const selectElement = document.querySelector('select[id="source"]');
      const secondOption = selectElement.options[1]; // Chỉ mục 1 là option thứ 2
      return secondOption.value; // Trả về giá trị của option thứ 2
    });

    listAccount = listAccount.filter((item) => item.account !== receiveAcc);

    const data = listAccount[0];
    await selectSource?.select(data.account);

    await sleep(3000);
    const balance = await page.waitForSelector('input[id="load_balance"]');
    const inputValue = await page.$eval(
      'input[id="load_balance"]',
      (el) => el.value,
    );

    if (inputValue !== 'null' && inputValue != null) {
      await page.waitForSelector('input[id="accountNo"]');
      await page.type('input[id="accountNo"]', receiveAcc, { delay: 100 });

      await page.waitForSelector('input[id="amount"]', { timeout: 60000 });
      await page.click('input[id="amount"]');
      await sleep(3000);
      await page.type('input[id="amount"]', inputValue, { delay: 100 });

      await sleep(3000);
      const submitButton = await page.waitForSelector('button[type="submit"]');
      await submitButton.click();

      await sleep(3000);
      await page.waitForSelector('button[type="submit"]');
      await page.click('button[type="submit"]');

      const isHaveOTP = await page
        .waitForSelector('input[id="otp"]')
        .then(() => true)
        .catch(() => false);

      if (isHaveOTP === false) {
        await page.goto('https://ebanking.lpbank.com.vn/transfer/m2lpb/');
        continue;
      }

      await checkNotify(driver);

      const service = await driver.$(
        `//android.widget.RelativeLayout[@resource-id="vn.com.lpb.lienviet24h:id/rl_drawer"]/android.widget.ImageView`,
      );
      await service.waitForExist({ timeout: 120000 });
      await service.click();

      await checkNotify(driver);

      const otpOption = await driver.$(`//*[@text="LPB OTP"]`);
      await otpOption.waitForExist({ timeout: 120000 });
      await otpOption.click();

      await checkNotify(driver);

      const PINText = await driver.$('//*[@text="Nhập mã PIN đăng nhập"]');
      await PINText.waitForExist({ timeout: 60000 });
      await pressKeySequence(driver, '111111');

      await checkNotify(driver);

      let OTP = '';
      const challengeText = await driver.$('//*[@text="LPB OTP"]');
      await challengeText.waitForExist({ timeout: 120000 });

      const elements = await driver.$$(
        '(//android.widget.TextView[@index="0"])',
      );
      for (let element of elements) {
        console.log(await element.getText());

        if ((await element.getText()).split(' ').length === 6) {
          OTP = (await element.getText()).split(' ').join('');
        }
      }

      await checkNotify(driver);

      if (OTP === '') {
        const elements = await driver.$$(
          '(//android.widget.TextView[@index="1"])',
        );

        OTP = (await elements[10].getText()).split(' ').join('');
        // for (let element of elements) {
        //   console.log(await element.getText());

        //   if ((await element.getText()).split(' ').length === 6) {
        //     OTP = (await element.getText()).split(' ').join('');
        //   }
        // }
      }

      console.log('Ma OTP: ', OTP);

      await page.waitForSelector('input[id="otp"]');
      await page.type('input[id="otp"]', OTP, { delay: 100 });

      await sleep(3000);
      await page.waitForSelector('button[type="submit"]');
      await page.click('button[type="submit"]');

      await page.waitForSelector(
        `button[onclick="redirectWithParam('/transfer/m2lpb/')"]`,
      );
      await page.click(
        `button[onclick="redirectWithParam('/transfer/m2lpb/')"]`,
      );

      await checkNotify(driver);

      const backBTN = await driver.$(
        '//*[@resource-id="vn.com.lpb.lienviet24h:id/iv_back"]',
      );
      await backBTN.click();
    }

    listAccount = listAccount.filter((item) => item.account !== data.account);
  }

  await browser.close();
});
