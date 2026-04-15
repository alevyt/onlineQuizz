(function () {
  var currentLang = "en";
  var dictionary = {};
  var availableLocales = [{ code: "en", label: "English" }];

  function format(text, params) {
    if (!params) return text;
    return String(text).replace(/\{(\w+)\}/g, function (_, key) {
      return params[key] !== undefined ? params[key] : "{" + key + "}";
    });
  }

  function resolveKey(key, fallback) {
    if (!key) return fallback || "";
    var parts = key.split(".");
    var node = dictionary;
    for (var i = 0; i < parts.length; i += 1) {
      if (!node || typeof node !== "object" || !(parts[i] in node)) {
        return fallback !== undefined ? fallback : key;
      }
      node = node[parts[i]];
    }
    if (typeof node === "string") return node;
    return fallback !== undefined ? fallback : key;
  }

  function t(key, params, fallback) {
    return format(resolveKey(key, fallback), params);
  }

  function applyToDocument(root) {
    var scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      el.setAttribute("placeholder", t(key));
    });
    scope.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-title");
      el.setAttribute("title", t(key));
    });
  }

  function setLangOnHtmlTag(lang) {
    document.documentElement.setAttribute("lang", lang);
  }

  function loadLocale(lang) {
    return fetch("/locales/" + encodeURIComponent(lang) + ".json")
      .then(function (r) {
        if (!r.ok) throw new Error("Locale not found");
        return r.json();
      })
      .then(function (data) {
        dictionary = data || {};
        currentLang = lang;
        localStorage.setItem("quiz_lang", lang);
        setLangOnHtmlTag(lang);
      });
  }

  function init() {
    var preferred = localStorage.getItem("quiz_lang") || "en";
    return fetch("/locales/index.json")
      .then(function (r) {
        if (!r.ok) throw new Error("No locale index");
        return r.json();
      })
      .then(function (data) {
        if (data && Array.isArray(data.locales) && data.locales.length) {
          availableLocales = data.locales;
        }
      })
      .catch(function () {
        availableLocales = [{ code: "en", label: "English" }];
      })
      .then(function () {
        return loadLocale(preferred).catch(function () {
          return loadLocale("en");
        });
      })
      .then(function () {
        applyToDocument(document);
      });
  }

  function bindLanguageSelector(selectId, onChange) {
    var select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = "";
    availableLocales.forEach(function (loc) {
      var option = document.createElement("option");
      option.value = loc.code;
      option.textContent = loc.label;
      if (loc.code === currentLang) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", function () {
      var next = select.value;
      loadLocale(next)
        .then(function () {
          applyToDocument(document);
          if (typeof onChange === "function") onChange(next);
        })
        .catch(function () {});
    });
  }

  window.I18N = {
    init: init,
    t: t,
    applyToDocument: applyToDocument,
    bindLanguageSelector: bindLanguageSelector,
    getLanguage: function () {
      return currentLang;
    }
  };
})();

