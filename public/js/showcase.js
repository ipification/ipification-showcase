import { notifyError } from "./notification.js";
import { showcaseMarkup } from "./showcase/markup.js";
import { attachStageCountryPicker } from "./showcase/stage-country-picker.js";
import intlTelInput from "/vendor/intl/js/intlTelInputWithUtils.mjs";
import { showQr } from "./qr.js";
import { showSms } from "./sms.js";
import { startSim } from "./sim.js";

import { storage, groups, needsPhone, esc } from "./showcase/config.js";

const container = document.querySelector("#showcase");
try {
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load showcase configuration");
  const config = await response.json();
  let defaultCountry = config.defaultCountry || "rs";
  if (!config.defaultCountry && config.appEnv !== "stage") {
    try {
      const geo = await fetch("/api/geoip");
      if (geo.ok) defaultCountry = (await geo.json()).country || defaultCountry;
    } catch {}
  }
  document.title = config.title || "IPification Showcase";
  const favicon = document.createElement("link");
  favicon.rel = "icon";
  favicon.href = config.faviconUrl || "/images/logo.ico";
  document.head.append(favicon);
  const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
  const tabs = Object.keys(groups).filter((tab) =>
    groups[tab].some((flow) =>
      config.clients.some((client) => client.user_flow === flow),
    ),
  );
  let tab = tabs.includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : tabs.includes(storage.get("selector"))
      ? storage.get("selector")
      : tabs[0];
  let server =
    config.auth_servers.find(
      (s) => s.id === storage.get("selected_auth_server_id"),
    )?.id ||
    config.auth_servers[0]?.id ||
    "";
  let phone = "",
    valid = false,
    iti,
    keyboardNavigation = false,
    activeSim = null,
    activePreparation = null,
    countryPicker,
    activeFlow = null;
  document.addEventListener("keydown", (event) => {
    if (
      event.key !== "Tab" &&
      event.target instanceof HTMLElement &&
      (event.target.matches("input, textarea") ||
        event.target.isContentEditable)
    )
      return;
    if (["Tab", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      keyboardNavigation = true;
      container.closest(".showcase-app").dataset.keyboardNavigation = "true";
    }
  });
  document.addEventListener("pointerdown", () => {
    keyboardNavigation = false;
    container.closest(".showcase-app").dataset.keyboardNavigation = "false";
  });
  function render() {
    countryPicker?.destroy();
    activeFlow = null;
    if (activePreparation) {
      activePreparation.abort();
      activePreparation = null;
    }
    if (activeSim) {
      activeSim.controller.abort();
      activeSim = null;
    }
    container.closest(".showcase-app").dataset.tab = tab;
    iti?.destroy();
    iti = undefined;
    phone = "";
    valid = false;
    container.innerHTML = showcaseMarkup({
      config,
      tab,
      server,
      tabs,
      countryNames,
      intlTelInput,
    });
    container.querySelectorAll('[role="tab"]').forEach((el) =>
      el.addEventListener("click", () => {
        tab = el.dataset.tab;
        history.replaceState(null, "", `#${tab}`);
        storage.set("selector", tab);
        render();
        container.querySelector(`[data-tab="${tab}"]`).focus();
      }),
    );
    container.querySelector("#site")?.addEventListener("click", (e) => {
      const list = container.querySelector("#site-list");
      list.hidden = !list.hidden;
      e.currentTarget.setAttribute("aria-expanded", String(!list.hidden));
    });
    container.querySelectorAll("[data-server]").forEach((el) =>
      el.addEventListener("click", () => {
        server = el.dataset.server;
        storage.set("selected_auth_server_id", server);
        container.querySelector("#site").textContent = server;
        container.querySelector("#site").setAttribute("aria-expanded", "false");
        container.querySelectorAll("[data-server]").forEach((option) =>
          option.setAttribute(
            "aria-selected",
            String(option.dataset.server === server),
          ),
        );
        container.querySelector("#site-list").hidden = true;
      }),
    );
    const logo = container.querySelector(".showcase-brand-logo");
    if (config.logoUrl && config.logoStyle)
      logo.style.cssText = config.logoStyle;
    function updateConsent(country) {
      container.querySelector(".showcase-legal")?.remove();
      if (country !== "vn") return;
      const legal = document.createElement("p");
      legal.className = "showcase-legal";
      legal.append(
        document.createTextNode(config.locale.footer.viettel_legal + " "),
      );
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = config.locale.footer.viettel;
      button.style.textDecoration = "underline";
      button.onclick = () => {
        const dialog = document.createElement("dialog");
        dialog.className = "showcase-dialog showcase-consent-dialog";
        dialog.dataset.slot = "dialog-content";
        dialog.setAttribute("aria-label", "Viettel consent");
        dialog.innerHTML =
          '<h2>Viettel consent</h2><iframe title="Viettel consent" src="https://www.ipification.com/consents/vn-viettel-001-vi.html" style="width:100%;height:60vh"></iframe><button type="button" data-slot="dialog-close" aria-label="Close">×</button>';
        dialog.querySelector("button").onclick = () => dialog.close();
        dialog.onclose = () => dialog.remove();
        document.body.append(dialog);
        dialog.showModal();
      };
      legal.append(
        button,
        document.createTextNode(" in case you are Viettel subscribers."),
      );
      container.querySelector(".showcase-footer").prepend(legal);
    }
    updateConsent(config.appEnv === "stage" ? "ww" : defaultCountry);
    const input = container.querySelector("#showcase-phone");
    container.closest(".showcase-app").dataset.keyboardNavigation =
      String(keyboardNavigation);
    container.querySelectorAll('[role="tab"]').forEach((el) =>
      el.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const index = tabs.indexOf(tab);
        tab =
          event.key === "Home"
            ? tabs[0]
            : event.key === "End"
              ? tabs.at(-1)
              : tabs[
                  (index +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    tabs.length) %
                    tabs.length
                ];
        history.replaceState(null, "", `#${tab}`);
        storage.set("selector", tab);
        render();
        container.querySelector(`[data-tab="${tab}"]`).focus();
      }),
    );
    if (input) {
      if (config.appEnv === "stage") {
        input.placeholder = "123456789";
        input.addEventListener("input", () => {
          input.value = input.value.replace(/\D/g, "");
          phone = input.value
            ? iti
              ? (
                  iti.getNumber() ||
                  iti.getSelectedCountry()?.dialCode + input.value
                ).replace(/[ +]/g, "")
              : "999" + input.value
            : "";
          valid = iti ? !!iti.isValidNumber() : !!input.value;
          container
            .querySelectorAll(".showcase-method-phone")
            .forEach((el) => (el.disabled = !!activeFlow || !input.value));
        });
      } else
        iti = intlTelInput(input, {
          initialCountry: defaultCountry,
          countrySelectorMode: config.disabledSelectCountry ? "OFF" : "AUTO",
          countrySearch: !config.disabledSelectCountry,
          separateDialCode: true,
          strictMode: false,
          formatAsYouType: false,
        });
      const update = () => {
        updateConsent(iti.getSelectedCountry()?.iso2);
        input.value = input.value.replace(/\D/g, "");
        phone = input.value
          ? (
              iti.getNumber() ||
              iti.getSelectedCountry()?.dialCode + input.value
            ).replace(/[ +]/g, "")
          : "";
        valid = Boolean(iti.isValidNumber());
        input.setAttribute(
          "aria-invalid",
          String(
            Boolean(input.value) && !valid && input.dataset.touched === "true",
          ),
        );
        document.querySelector("#phone-guidance").textContent =
          input.dataset.touched === "true" && input.value && !valid
            ? "Enter a valid phone number for the selected country."
            : valid
              ? "Phone number is ready. Choose a verification method."
              : input.value
                ? "Choose a verification method to check this phone number."
                : "Enter a phone number to enable verification methods.";
        container
          .querySelectorAll(".showcase-method-phone")
          .forEach((el) => (el.disabled = !!activeFlow || !input.value));
      };
      if (config.appEnv !== "stage") {
        input.addEventListener("blur", () => {
          input.dataset.touched = "true";
          update();
        });
        input.addEventListener("input", update);
        input.addEventListener("countrychange", update);
      }
      container
        .querySelector("#stage-country")
        ?.addEventListener("change", (event) => {
          const country = event.target.value;
          updateConsent(country);
          const wrap = input.parentElement;
          iti?.destroy();
          iti = undefined;
          input.value = "";
          phone = "";
          valid = false;
          if (country === "ww") {
            if (!wrap.classList.contains("showcase-wonderland")) {
              const wonder = document.createElement("div");
              wonder.className = "iti showcase-wonderland";
              wonder.innerHTML =
                '<span class="showcase-wonderland-flag" aria-hidden="true"></span><span class="showcase-wonderland-code">+999</span>';
              input.before(wonder);
              wonder.append(input);
            }
            input.placeholder = "123456789";
          } else {
            if (wrap.classList.contains("showcase-wonderland")) {
              wrap.before(input);
              wrap.remove();
            }
            iti = intlTelInput(input, {
              initialCountry: country,
              countrySelectorMode: "OFF",
              separateDialCode: true,
              strictMode: false,
              formatAsYouType: false,
            });
          }
          container
            .querySelectorAll(".showcase-method-phone")
            .forEach((el) => (el.disabled = true));
        });
      if (config.appEnv === "stage")
        countryPicker = attachStageCountryPicker(
          container.querySelector("#stage-country"),
          container.querySelector(".showcase-stage-country"),
          container.querySelector(".showcase-country-menu"),
        );
    }
    container
      .querySelectorAll(".showcase-method")
      .forEach((el) =>
        el.addEventListener("click", () =>
          start(config.clients.find((c) => c.user_flow === el.id)),
        ),
      );
    container.querySelector("#about")?.addEventListener("click", () => {
      const selected = config.auth_servers.find((item) => item.id === server),
        dialog = document.createElement("dialog");
      dialog.className = "showcase-dialog showcase-about-dialog";
      dialog.dataset.slot = "dialog-content";
      dialog.innerHTML = `<h2 data-slot="dialog-title">${esc(config.locale.modals.about_title)}</h2><p>${esc(config.locale.modals.server_label)}: ${esc(selected?.id)}</p><p>${esc(selected?.url)}</p><a href="https://developer.ipification.com/#/" target="_blank" rel="noreferrer">${esc(config.locale.modals.developer_link)}</a><button type="button" data-slot="dialog-close" aria-label="Close">×</button>`;
      dialog.querySelector("button").onclick = () => dialog.close();
      dialog.addEventListener("close", () => dialog.remove());
      document.body.append(dialog);
      dialog.showModal();
    });
  }
  function endFlow(token) {
    if (!token || activeFlow !== token) return;
    activeFlow = null;
    container.querySelectorAll(".showcase-method").forEach((button) => {
      button.disabled = needsPhone(button.id) && !phone;
      button.setAttribute("aria-busy", "false");
    });
  }
  async function start(client) {
    if (activeFlow) return;
    if (needsPhone(client.user_flow) && !valid) {
      notifyError(config.locale.modals.phone_invalid);
      return;
    }
    const token = {};
    activeFlow = token;
    container.querySelectorAll(".showcase-method").forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-busy", String(button.id === client.user_flow));
    });
    if (client.user_flow === "pvn_sms")
      return showSms(client, token, { phone, server, endFlow, jsonPost, showError: notifyError, isActive: (current) => activeFlow === current });
    if (client.user_flow === "pvn_sim" || client.user_flow === "login_sim")
      return startSim(client, token, {
        getActiveSim: () => activeSim,
        setActiveSim: (value) => {
          activeSim = value;
        },
        server,
        phone,
        container,
        endFlow,
        jsonPost,
        showError: notifyError,
      });
    const mobile =
      innerWidth <= 768 || /Android|iPhone|Mobile/i.test(navigator.userAgent);
    const qr = !mobile && !client.user_flow.endsWith("_im");
    if (activePreparation) return;
    const controller = new AbortController();
    activePreparation = controller;
    try {
      const result = await fetch("/auth/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          user_flow: client.user_flow,
          server_id: server,
          qr,
          ...(needsPhone(client.user_flow) ? { phone } : {}),
        }),
      });
      if (!result.ok) throw new Error("Unable to prepare verification");
      const attempt = await result.json();
      if (controller.signal.aborted || activePreparation !== controller) return;
      if (!qr) location.assign(attempt.url);
      else showQr(attempt, client, token, { start, endFlow });
    } catch {
      if (!controller.signal.aborted) {
        notifyError("Unable to open verification. Please try again.");
        endFlow(token);
      }
    } finally {
      if (activePreparation === controller) {
        activePreparation = null;
      }
    }
  }
  render();
  container.hidden = false;
  document.querySelector(".showcase-loading").remove();
  window.addEventListener("pageshow", () => endFlow(activeFlow));
  window.addEventListener("resize", () => {
    const el = container.querySelector("#pvn_ipificator");
    if (el)
      el.hidden = !(
        innerWidth <= 768 || /Android|iPhone|Mobile/i.test(navigator.userAgent)
      );
  });
  window.addEventListener("hashchange", () => {
    const next = location.hash.slice(1);
    if (tabs.includes(next) && next !== tab) {
      tab = next;
      render();
    }
  });

  // Callback messages are stored in the session and consumed once.
  fetch("/auth/login/error", { cache: "no-store" })
    .then((r) => r.json())
    .then(({ error_message: message }) => { if (message) notifyError(message); })
    .catch(() => {});

  async function jsonPost(url, body, signal) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    return { response, data };
  }
} catch {
  const loading = document.querySelector(".showcase-loading");
  if (loading)
    loading.textContent =
      "Showcase is not ready. Check runtime configuration and retry.";
}
