/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-present eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

"use strict";

const BasePage = require("./base.page");

class GooglePage extends BasePage
{
  constructor(browser)
  {
    super();
    this.browser = browser;
  }

  async init()
  {
    await this.browser.url("https://www.google.com/");
  }

  get acceptAllButton()
  {
    return $(">>>#L2AGLb");
  }

  get adTag()
  {
    return $("//span[text()='Ad']");
  }

  get searchBox()
  {
    return $("//input[@title='Search']");
  }

  async clickAcceptAllButton()
  {
    await this.waitForEnabledThenClick(this.acceptAllButton);
  }

  async isAdTagDisplayed(reverse = false)
  {
    return await this.waitForDisplayedNoError(this.adTag, reverse);
  }

  async searchForText(text)
  {
    await (await this.searchBox).click();
    await (await this.searchBox).clearValue();
    await this.browser.keys(text);
    await browser.keys("Enter");
  }
}

module.exports = GooglePage;
