/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2016 Eyeo GmbH
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

(function()
{
  var subscriptionsMap = Object.create(null);
  var recommendationsMap = Object.create(null);
  var filtersMap = Object.create(null);
  var collections = Object.create(null);
  var maxLabelId = 0;
  var getMessage = ext.i18n.getMessage;
  var filterErrors =
  {
    "synchronize_invalid_url": "options_filterList_lastDownload_invalidURL",
    "synchronize_connection_error": "options_filterList_lastDownload_connectionError",
    "synchronize_invalid_data": "options_filterList_lastDownload_invalidData",
    "synchronize_checksum_mismatch": "options_filterList_lastDownload_checksumMismatch"
  };

  function Collection(details)
  {
    this.details = details;
    this.items = [];
  }

  Collection.prototype._setEmpty = function(table, text)
  {
    var placeholder = table.querySelector(".empty-placeholder");
    if (text && !placeholder)
    {
      placeholder = document.createElement("li");
      placeholder.className = "empty-placeholder";
      placeholder.textContent = getMessage(text);
      table.appendChild(placeholder);
    }
    else if (placeholder)
      table.removeChild(placeholder);
  }

  Collection.prototype._createElementQuery = function(item)
  {
    var access = (item.url || item.text).replace(/'/g, "\\'");
    return function(container)
    {
      return container.querySelector("[data-access='" + access + "']");
    };
  };

  Collection.prototype.addItems = function() 
  {
    var length = Array.prototype.push.apply(this.items, arguments);
    if (length == 0)
      return;

    this.items.sort(function(a, b)
    {
      var aValue = (a.title || a.text || a.url).toLowerCase();
      var bValue = (b.title || b.text || b.url).toLowerCase();
      return aValue.localeCompare(bValue);
    });

    for (var j = 0; j < this.details.length; j++) 
    {
      var table = E(this.details[j].id);
      var template = table.querySelector("template");
      for (var i = 0; i < arguments.length; i++) 
      {
        var item = arguments[i];
        var listItem = document.createElement("li");
        listItem.appendChild(document.importNode(template.content, true));
        listItem.setAttribute("data-access", item.url || item.text);

        var labelId = "label-" + (++maxLabelId);
        listItem.querySelector(".display").setAttribute("id", labelId);
        var control = listItem.querySelector(".control");
        if (control)
        {
          // We use aria-labelledby to avoid triggering the control when
          // interacting with the label
          control.setAttribute("aria-labelledby", labelId);
          control.addEventListener("click", this.details[j].onClick, false);
        }

        this._setEmpty(table, null);
        if (table.hasChildNodes())
        {
          table.insertBefore(listItem, 
              table.childNodes[this.items.indexOf(item)]);
        }
        else
          table.appendChild(listItem);
        this.updateItem(item);
      }
    }
    return length;
  };

  Collection.prototype.removeItem = function(item)
  {
    var index = this.items.indexOf(item);
    if (index == -1)
      return;

    this.items.splice(index, 1);
    var getListElement = this._createElementQuery(item);
    for (var i = 0; i < this.details.length; i++)
    {
      var table = E(this.details[i].id);
      var element = getListElement(table);

      // Element gets removed so make sure to handle focus appropriately
      var control = element.querySelector(".control");
      if (control && control == document.activeElement)
      {
        if (!focusNextElement(element.parentElement, control))
        {
          // Fall back to next focusable element within same tab or dialog
          var focusableElement = element.parentElement;
          while (focusableElement)
          {
            if (focusableElement.classList.contains("tab-content")
                || focusableElement.classList.contains("dialog-content"))
              break;

            focusableElement = focusableElement.parentElement;
          }
          focusNextElement(focusableElement || document, control);
        }
      }

      element.parentElement.removeChild(element);
      if (this.items.length == 0)
        this._setEmpty(table, this.details[i].emptyText);
    }
  };

  Collection.prototype.updateItem = function(item)
  {
    var access = (item.url || item.text).replace(/'/g, "\\'");
    for (var i = 0; i < this.details.length; i++)
    {
      var table = E(this.details[i].id);
      var element = table.querySelector("[data-access='" + access + "']");
      if (!element)
        continue;

      var title = item.title || item.url || item.text;
      element.querySelector(".display").textContent = title;
      if (title)
        element.setAttribute("data-search", title.toLowerCase());
      var control = element.querySelector(".control[role='checkbox']");
      if (control)
        control.setAttribute("aria-checked", item.disabled == false);

      var downloadStatus = item.downloadStatus;
      var dateElement = element.querySelector(".date");
      var timeElement = element.querySelector(".time");
      if(dateElement && timeElement)
      {
        var message = element.querySelector(".message");
        ext.backgroundPage.sendMessage(
        {
          type: "subscriptions.isDownloading",
          url: item.url
        },
        function(isDownloading)
        {
          if (isDownloading)
          {
            var text = getMessage("options_filterList_lastDownload_inProgress");
            message.textContent = text;
            element.classList.add("show-message");
          }
          else if (downloadStatus && downloadStatus != "synchronize_ok")
          {
            if (downloadStatus in filterErrors)
              message.textContent = getMessage(filterErrors[downloadStatus]);
            else
              message.textContent = item.downloadStatus;
            element.classList.add("show-message");
          }
          else if (item.lastDownload > 0)
          {
            var dateTime = i18n_formatDateTime(item.lastDownload * 1000);
            dateElement.textContent = dateTime[0];
            timeElement.textContent = dateTime[1];
            element.classList.remove("show-message");
          }
        });
      }
      var websiteElement = element.querySelector(".context-menu .website");
      var sourceElement = element.querySelector(".context-menu .source");
      if (websiteElement && item.homepage)
        websiteElement.setAttribute("href", item.homepage);
      if (sourceElement)
        sourceElement.setAttribute("href", item.url);
    }
  };

  Collection.prototype.clearAll = function()
  {
    this.items = [];
    for (var i = 0; i < this.details.length; i++)
    {
      var table = E(this.details[i].id);
      var element = table.firstChild;
      while (element)
      {
        if (element.tagName == "LI" && !element.classList.contains("static"))
          table.removeChild(element);
        element = element.nextElementSibling;
      }

      this._setEmpty(table, this.details[i].emptyText);
    }
  };

  function focusNextElement(container, currentElement)
  {
    var focusables = container.querySelectorAll("a, button, input, .control");
    focusables = Array.prototype.slice.call(focusables);
    var index = focusables.indexOf(currentElement);
    index += (index == focusables.length - 1) ? -1 : 1;

    var nextElement = focusables[index];
    if (!nextElement)
      return false;

    nextElement.focus();
    return true;
  }

  function toggleRemoveSubscription(e)
  {
    e.preventDefault();
    var subscriptionUrl = findParentData(e.target, "access", false);
    if (e.target.getAttribute("aria-checked") == "true")
    {
      ext.backgroundPage.sendMessage({
        type: "subscriptions.remove",
        url: subscriptionUrl
      });
    }
    else
      addEnableSubscription(subscriptionUrl);
  }

  function toggleDisableSubscription(e)
  {
    e.preventDefault();
    var subscriptionUrl = findParentData(e.target, "access", false);
    ext.backgroundPage.sendMessage(
    {
      type: "subscriptions.toggle",
      keepInstalled: true,
      url: subscriptionUrl
    });
  }

  function onAddLanguageSubscriptionClick(e)
  {
    e.preventDefault();
    var url = findParentData(this, "access", false);
    addEnableSubscription(url);
  }

  function onRemoveFilterClick()
  {
    var filter = findParentData(this, "access", false);
    ext.backgroundPage.sendMessage(
    {
      type: "filters.remove",
      text: filter
    });
  }

  collections.popular = new Collection(
  [
    {
      id: "recommend-list-table",
      onClick: toggleRemoveSubscription
    }
  ]);
  collections.langs = new Collection(
  [
    {
      id: "blocking-languages-table",
      emptyText: "options_dialog_language_added_empty",
      onClick: toggleRemoveSubscription
    },
    {
      id: "blocking-languages-dialog-table",
      emptyText: "options_dialog_language_added_empty"
    }
  ]);
  collections.allLangs = new Collection(
  [
    {
      id: "all-lang-table",
      emptyText: "options_dialog_language_other_empty",
      onClick: onAddLanguageSubscriptionClick
    }
  ]);
  collections.acceptableAds = new Collection(
  [
    {
      id: "acceptableads-table",
      onClick: toggleRemoveSubscription
    }
  ]);
  collections.custom = new Collection(
  [
    {
      id: "custom-list-table",
      onClick: toggleRemoveSubscription
    }
  ]);
  collections.whitelist = new Collection(
  [
    {
      id: "whitelisting-table",
      emptyText: "options_whitelisted_empty",
      onClick: onRemoveFilterClick
    }
  ]);
  collections.customFilters = new Collection(
  [
    {
      id: "custom-filters-table",
      emptyText: "options_customFilters_empty"
    }
  ]);
  collections.filterLists = new Collection(
  [
    {
      id: "all-filter-lists-table",
      onClick: toggleDisableSubscription
    }
  ]);

  function observeSubscription(subscription)
  {
    function onObjectChanged(change)
    {
      for (var i = 0; i < change.length; i++)
      {
        if (change[i].name == "disabled")
        {
          var recommendation = recommendationsMap[subscription.url];
          if (recommendation && recommendation.type == "ads")
          {
            if (subscription.disabled == false)
            {
              collections.allLangs.removeItem(subscription);
              collections.langs.addItems(subscription);
            }
            else
            {
              collections.allLangs.addItems(subscription);
              collections.langs.removeItem(subscription);
            }
          }
        }
        for (var i in collections)
          collections[i].updateItem(subscription);
      }
    }

    if (!Object.observe)
    {
      ["disabled", "lastDownload"].forEach(function(property)
      {
        subscription["$" + property] = subscription[property];
        Object.defineProperty(subscription, property,
        {
          get: function()
          {
            return this["$" + property];
          },
          set: function(newValue)
          {
            var oldValue = this["$" + property];
            if (oldValue != newValue)
            {
              this["$" + property] = newValue;
              var change = Object.create(null);
              change.name = property;
              onObjectChanged([change]);
            }
          }
        });
      });
    }
    else
    {
      Object.observe(subscription, onObjectChanged);
    }
  }

  function updateSubscription(subscription)
  {
    var subscriptionUrl = subscription.url;
    var knownSubscription = subscriptionsMap[subscriptionUrl];
    if (knownSubscription)
    {
      for (var property in subscription)
        if (property != "title")
          knownSubscription[property] = subscription[property];
    }
    else
    {
      observeSubscription(subscription);
      getAcceptableAdsURL(function(acceptableAdsUrl)
      {
        var collection = null;
        if (subscriptionUrl in recommendationsMap)
        {
          var recommendation = recommendationsMap[subscriptionUrl];
          if (recommendation.type != "ads")
            collection = collections.popular;
          else if (subscription.disabled == false)
            collection = collections.langs;
          else
            collection = collections.allLangs;
        }
        else if (subscriptionUrl == acceptableAdsUrl)
          collection = collections.acceptableAds;
        else
          collection = collections.custom;

        collection.addItems(subscription);
        subscriptionsMap[subscriptionUrl] = subscription;
      });
    }
  }

  function updateFilter(filter)
  {
    var match = filter.text.match(/^@@\|\|([^\/:]+)\^\$document$/);
    if (match && !filtersMap[filter.text])
    {
      filter.title = match[1];
      collections.whitelist.addItems(filter);
    }
    else
      collections.customFilters.addItems(filter);

    filtersMap[filter.text] = filter;
  }

  function loadRecommendations()
  {
    fetch("subscriptions.xml")
      .then(function(response)
      {
        return response.text();
      })
      .then(function(text)
      {
        var list = document.getElementById("subscriptionSelector");
        var doc = new DOMParser().parseFromString(text, "application/xml");
        var elements = doc.documentElement.getElementsByTagName("subscription");
        for (var i = 0; i < elements.length; i++)
        {
          var element = elements[i];
          var subscription = Object.create(null);
          subscription.title = element.getAttribute("title");
          subscription.url = element.getAttribute("url");
          subscription.disabled = null;
          subscription.downloadStatus = null;
          subscription.homepage = null;
          var recommendation = Object.create(null);
          recommendation.type = element.getAttribute("type");
          var prefix = element.getAttribute("prefixes");
          if (prefix)
          {
            prefix = prefix.replace(/\W/g, "_");
            subscription.title = getMessage("options_language_" + prefix);
          }
          else
          {
            var type = recommendation.type.replace(/\W/g, "_");
            subscription.title = getMessage("common_feature_" + type + "_title");
          }

          recommendationsMap[subscription.url] = recommendation;
          updateSubscription(subscription);
        }
      });
  }

  function findParentData(element, dataName, returnElement)
  {
    while (element)
    {
      if (element.hasAttribute("data-" + dataName))
        return returnElement ? element : element.getAttribute("data-" + dataName);

      element = element.parentElement;
    }
    return null;
  }

  function onClick(e)
  {
    var context = document.querySelector(".show-context-menu");
    if (context)
      context.classList.remove("show-context-menu");

    var element = e.target;
    while (true)
    {
      if (!element)
        return;

      if (element.hasAttribute("data-action"))
        break;

      element = element.parentElement;
    }

    var actions = element.getAttribute("data-action").split(",");
    for (var i = 0; i < actions.length; i++)
    {
      switch (actions[i])
      {
        case "add-domain-exception":
          addWhitelistedDomain();
          break;
        case "add-predefined-subscription":
          var dialog = E("dialog-content-predefined");
          var title = dialog.querySelector("h3").textContent;
          var url = dialog.querySelector(".url").textContent;
          addEnableSubscription(url, title);
          closeDialog();
          break;
        case "cancel-custom-filters":
          E("custom-filters").classList.remove("mode-edit");
          break;
        case "cancel-domain-exception":
          E("whitelisting-textbox").value = "";
          document.querySelector("#whitelisting .controls").classList.remove("mode-edit");
          break;
        case "close-dialog":
          closeDialog();
          break;
        case "edit-custom-filters":
          E("custom-filters").classList.add("mode-edit");
          editCustomFilters();
          break;
        case "edit-domain-exception":
          document.querySelector("#whitelisting .controls").classList.add("mode-edit");
          E("whitelisting-textbox").focus();
          break;
        case "import-subscription":
          var url = E("blockingList-textbox").value;
          addEnableSubscription(url);
          closeDialog();
          break;
        case "open-dialog":
          openDialog(element.getAttribute("data-dialog"));
          break;
        case "save-custom-filters":
          ext.backgroundPage.sendMessage(
          {
            type: "filters.importRaw",
            text: E("custom-filters-raw").value
          });
          E("custom-filters").classList.remove("mode-edit");
          break;
        case "switch-tab":
          document.body.setAttribute("data-tab",
            element.getAttribute("data-tab"));
          break;
        case "update-all-subscriptions":
          ext.backgroundPage.sendMessage(
          {
            type: "subscriptions.update"
          });
          break;
        case "open-context-menu":
          var listItem = findParentData(element, "access", true);
          if (listItem != context)
            listItem.classList.add("show-context-menu");
          break;
        case "update-subscription":
          ext.backgroundPage.sendMessage(
          {
            type: "subscriptions.update",
            url: findParentData(element, "access", false)
          });
          break;
        case "remove-subscription":
          ext.backgroundPage.sendMessage(
          {
            type: "subscriptions.remove",
            url: findParentData(element, "access", false)
          });
          break;
      }
    }
  }

  function onDOMLoaded()
  {
    populateLists();
    function onFindLanguageKeyUp()
    {
      var searchStyle = E("search-style");
      if (!this.value)
        searchStyle.innerHTML = "";
      else
        searchStyle.innerHTML = "#all-lang-table li:not([data-search*=\"" + this.value.toLowerCase() + "\"]) { display: none; }";
    }

    function getKey(e)
    {
      // e.keyCode has been deprecated so we attempt to use e.key
      if ("key" in e)
        return e.key;
      return getKey.keys[e.keyCode];
    }
    getKey.keys = {
      9: "Tab",
      13: "Enter",
      27: "Escape"
    };

    // Initialize navigation sidebar
    ext.backgroundPage.sendMessage(
    {
      type: "app.get",
      what: "addonVersion"
    },
    function(addonVersion)
    {
      E("abp-version").textContent = addonVersion;
    });
    getDocLink("releases", function(link)
    {
      E("link-version").setAttribute("href", link);
    });

    getDocLink("contribute", function(link)
    {
      document.querySelector("#tab-contribute a").setAttribute("href", link);
    });

    updateShareLink();

    // Initialize interactive UI elements
    document.body.addEventListener("click", onClick, false);
    var placeholderValue  = getMessage("options_dialog_language_find");
    E("find-language").setAttribute("placeholder", placeholderValue);
    E("find-language").addEventListener("keyup", onFindLanguageKeyUp, false);
    E("whitelisting-textbox").addEventListener("keypress", function(e)
    {
      if (getKey(e) == "Enter")
        addWhitelistedDomain();
    }, false);

    // Advanced tab
    var filterTextbox = document.querySelector("#custom-filters-add input");
    placeholderValue = getMessage("options_customFilters_textbox_placeholder");
    filterTextbox.setAttribute("placeholder", placeholderValue);
    function addCustomFilters()
    {
      var filterText = filterTextbox.value;
      ext.backgroundPage.sendMessage(
      {
        type: "filters.add",
        text: filterText
      });
      filterTextbox.value = "";
    }
    E("custom-filters-add").addEventListener("submit", function(e)
    {
      e.preventDefault();
      addCustomFilters();
    }, false);
    var customFilterEditButtons = document.querySelectorAll("#custom-filters-edit-wrapper button");

    E("dialog").addEventListener("keydown", function(e)
    {
      switch (getKey(e))
      {
        case "Escape":
          closeDialog();
          break;
        case "Tab":
          if (e.shiftKey)
          {
            if (e.target.classList.contains("focus-first"))
            {
              e.preventDefault();
              this.querySelector(".focus-last").focus();
            }
          }
          else if (e.target.classList.contains("focus-last"))
          {
            e.preventDefault();
            this.querySelector(".focus-first").focus();
          }
          break;
      }
    }, false);
  }

  var focusedBeforeDialog = null;
  function openDialog(name)
  {
    var dialog = E("dialog");
    dialog.setAttribute("aria-hidden", false);
    dialog.setAttribute("aria-labelledby", "dialog-title-" + name);
    document.body.setAttribute("data-dialog", name);

    var defaultFocus = document.querySelector("#dialog-content-" + name
      + " .default-focus");
    if (!defaultFocus)
      defaultFocus = dialog.querySelector(".focus-first");
    focusedBeforeDialog = document.activeElement;
    defaultFocus.focus();
  }

  function closeDialog()
  {
    var dialog = E("dialog");
    dialog.setAttribute("aria-hidden", true);
    dialog.removeAttribute("aria-labelledby");
    document.body.removeAttribute("data-dialog");
    focusedBeforeDialog.focus();
  }

  function populateLists()
  {
    subscriptionsMap = Object.create(null);
    filtersMap = Object.create(null);
    recommendationsMap = Object.create(null);

    // Empty collections and lists
    for (var property in collections)
      collections[property].clearAll();

    ext.backgroundPage.sendMessage(
    {
      type: "subscriptions.get",
      special: true
    },
    function(subscriptions)
    {
      // Load filters
      for (var i = 0; i < subscriptions.length; i++)
      {
        ext.backgroundPage.sendMessage(
        {
          type: "filters.get",
          subscriptionUrl: subscriptions[i].url
        }, 
        function(filters)
        {
          for (var i = 0; i < filters.length; i++)
            updateFilter(filters[i]);
        });
      }
    });
    loadRecommendations();
    getAcceptableAdsURL(function(acceptableAdsUrl)
    {
      var subscription = Object.create(null);
      subscription.url = acceptableAdsUrl;
      subscription.disabled = true;
      subscription.title = getMessage("options_acceptableAds_description");
      updateSubscription(subscription);

      // Load user subscriptions
      ext.backgroundPage.sendMessage(
      {
        type: "subscriptions.get",
        downloadable: true
      }, 
      function(subscriptions)
      {
        for (var i = 0; i < subscriptions.length; i++)
          onSubscriptionMessage("added", subscriptions[i]);
      });
    });
  }

  function addWhitelistedDomain()
  {
    var domain = E("whitelisting-textbox");
    if (domain.value)
    {
      ext.backgroundPage.sendMessage(
      {
        type: "filters.add",
        text: "@@||" + domain.value.toLowerCase() + "^$document"
      });
    }

    domain.value = "";
    document.querySelector("#whitelisting .controls").classList.remove("mode-edit");
  }

  function editCustomFilters()
  {
    var customFilterItems = collections.customFilters.items;
    var filterTexts = [];
    for (var i = 0; i < customFilterItems.length; i++)
      filterTexts.push(customFilterItems[i].text);
    E("custom-filters-raw").value = filterTexts.join("\n");
  }

  function getAcceptableAdsURL(callback)
  {
    ext.backgroundPage.sendMessage(
    {
      type: "prefs.get",
      key: "subscriptions_exceptionsurl"
    },
    function(value)
    {
      getAcceptableAdsURL = function(callback)
      {
        callback(value);
      }
      getAcceptableAdsURL(callback);
    });
  }

  function addEnableSubscription(url, title, homepage)
  {
    var messageType = null;
    var knownSubscription = subscriptionsMap[url];
    if (knownSubscription && knownSubscription.disabled == true)
      messageType = "subscriptions.toggle"
    else
      messageType = "subscriptions.add"

    var message = {
      type: messageType,
      url: url
    };
    if (title)
      message.title = title;
    if (homepage)
      message.homepage = homepage;

    ext.backgroundPage.sendMessage(message);
  }

  function onFilterMessage(action, filter)
  {
    switch (action)
    {
      case "added":
        updateFilter(filter);
        updateShareLink();
        break;
      case "loaded":
        populateLists();
        break;
      case "removed":
        var knownFilter = filtersMap[filter.text];
        collections.whitelist.removeItem(knownFilter);
        collections.customFilters.removeItem(knownFilter);
        delete filtersMap[filter.text];
        updateShareLink();
        break;
    }
  }

  function onSubscriptionMessage(action, subscription)
  {
    switch (action)
    {
      case "added":
        updateSubscription(subscription);
        updateShareLink();

        var knownSubscription = subscriptionsMap[subscription.url];
        if (knownSubscription)
          collections.filterLists.addItems(knownSubscription);
        else
          collections.filterLists.addItems(subscription);
        break;
      case "disabled":
        updateSubscription(subscription);
        updateShareLink();
        break;
      case "lastDownload":
        updateSubscription(subscription);
        break;
      case "homepage":
        // TODO: NYI
        break;
      case "removed":
        var knownSubscription = subscriptionsMap[subscription.url];
        getAcceptableAdsURL(function(acceptableAdsUrl)
        {
          if (subscription.url == acceptableAdsUrl)
          {
            subscription.disabled = true;
            updateSubscription(subscription);
          }
          else
          {
            if (subscription.url in recommendationsMap)
              knownSubscription.disabled = true;
            else
            {
              collections.custom.removeItem(knownSubscription);
              delete subscriptionsMap[subscription.url];
            }
          }
          updateShareLink();
          collections.filterLists.removeItem(knownSubscription);
        });
        break;
      case "title":
        // TODO: NYI
        break;
    }
  }

  function onShareLinkClick(e)
  {
    e.preventDefault();

    getDocLink("share-general", function(link)
    {
      openSharePopup(link);
    });
  }

  function updateShareLink()
  {
    var shareResources = [
      "https://facebook.com/plugins/like.php?",
      "https://platform.twitter.com/widgets/",
      "https://apis.google.com/se/0/_/+1/fastbutton?"
    ];
    var isAnyBlocked = false;
    var checksRemaining = shareResources.length;

    function onResult(isBlocked)
    {
      isAnyBlocked |= isBlocked;
      if (!--checksRemaining)
      {
        // Hide the share tab if a script on the share page would be blocked
        var tab = E("tab-share");
        if (isAnyBlocked)
        {
          tab.hidden = true;
          tab.removeEventListener("click", onShareLinkClick, false);
        }
        else
          tab.addEventListener("click", onShareLinkClick, false);
      }
    }

    for (var i = 0; i < shareResources.length; i++)
      checkShareResource(shareResources[i], onResult);
  }

  ext.onMessage.addListener(function(message)
  {
    switch (message.type)
    {
      case "app.listen":
        if (message.action == "addSubscription")
        {
          var subscription = message.args[0];
          var dialog = E("dialog-content-predefined");
          dialog.querySelector("h3").textContent = subscription.title || "";
          dialog.querySelector(".url").textContent = subscription.url;
          openDialog("predefined");
        }
        else if (message.action == "error")
        {
          alert(message.args.join("\n"));
        }
        break;
      case "filters.listen":
        onFilterMessage(message.action, message.args[0]);
        break;
      case "subscriptions.listen":
        onSubscriptionMessage(message.action, message.args[0]);
        break;
    }
  });

  ext.backgroundPage.sendMessage(
  {
    type: "app.listen",
    filter: ["addSubscription", "error"]
  });
  ext.backgroundPage.sendMessage(
  {
    type: "filters.listen",
    filter: ["added", "loaded", "removed"]
  });
  ext.backgroundPage.sendMessage(
  {
    type: "subscriptions.listen",
    filter: ["added", "disabled", "homepage", "lastDownload", "removed", "title"]
  });

  window.addEventListener("DOMContentLoaded", onDOMLoaded, false);
})();