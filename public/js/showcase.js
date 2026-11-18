import intlTelInput from "/vendor/intl/js/intlTelInputWithUtils.mjs";
import { showQr } from "./qr.js";
import { showSms } from "./sms.js";
import { startSim } from "./sim.js";

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};
const groups = {
  pnv: [
    "pvn_ip",
    "pvn_ip_plus",
    "pvn_im",
    "pvn_ipificator",
    "pvn_sim",
    "pvn_sms",
  ],
  login: ["login_ip", "login_ip_plus", "login_im", "login_sim"],
  identity: ["anonymous", "kyc_phone"],
};
const keys = {
  pvn_ip: "ip",
  login_ip: "ip",
  pvn_ip_plus: "ip_plus",
  login_ip_plus: "ip_plus",
  pvn_im: "im",
  login_im: "im",
  pvn_ipificator: "ip_via_app",
  pvn_sim: "sim",
  login_sim: "sim",
  pvn_sms: "sms",
  anonymous: "anonymous_identity",
  kyc_phone: "kyc",
};
const needsPhone = (flow) => flow.startsWith("pvn_") || flow === "kyc_phone";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
const container = document.querySelector("#showcase");
try {
  const response = await fetch("/api/showcase-config", { cache: "no-store" });
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
      container.closest(".legacy-showcase").dataset.keyboardNavigation = "true";
    }
  });
  document.addEventListener("pointerdown", () => {
    keyboardNavigation = false;
    container.closest(".legacy-showcase").dataset.keyboardNavigation = "false";
  });
  function render() {
    activeFlow = null;
    if (activePreparation) {
      activePreparation.abort();
      activePreparation = null;
    }
    if (activeSim) {
      activeSim.controller.abort();
      activeSim = null;
    }
    container.closest(".legacy-showcase").dataset.tab = tab;
    iti?.destroy();
    iti = undefined;
    phone = "";
    valid = false;
    const section = config.locale.sections[tab];
    const mobile =
      innerWidth <= 768 || /Android|iPhone|Mobile/i.test(navigator.userAgent);
    let sim = false;
    try {
      sim =
        window.DigitalCredential?.userAgentAllowsProtocol?.(
          "openid4vp-v1-unsigned",
        ) === true;
    } catch {}
    const methods = groups[tab].filter(
      (flow) =>
        config.clients.some((c) => c.user_flow === flow) &&
        (!flow.endsWith("_sim") || sim),
    );
    const button = (flow) => {
      const client = config.clients.find((c) => c.user_flow === flow),
        key = keys[flow];
      const label =
        section?.[`button_${key}_label`] ||
        config.locale.buttons[key] ||
        client.title ||
        flow;
      return `<button id="${esc(flow)}" type="button" ${flow === "pvn_ipificator" && !mobile ? "hidden" : ""} class="legacy-method ${needsPhone(flow) ? "legacy-method-phone" : "legacy-method-direct"}" ${needsPhone(flow) ? "disabled" : ""}><span>${esc(label)}</span><span class="legacy-method-arrow" aria-hidden="true"></span></button>`;
    };
    const phoneBox = `${
      config.appEnv === "stage"
        ? `<label class="sr-only" for="stage-country">Country</label><select id="stage-country" title="Choose country" class="legacy-stage-country" ${config.disabledSelectCountry ? "disabled" : ""}><option value="ww">Wonderland (+999)</option>${intlTelInput
            .getAllCountries()
            .map(
              (c) =>
                `<option value="${esc(c.iso2)}">${esc(countryNames.of(c.iso2.toUpperCase()) || c.iso2)} (+${esc(c.dialCode)})</option>`,
            )
            .join("")}</select>`
        : ""
    }<div class="legacy-phone ${config.appEnv === "stage" ? "legacy-stage-phone" : ""}"><label class="sr-only" for="showcase-phone">Phone number</label>${config.appEnv === "stage" ? '<div class="iti legacy-wonderland"><span class="legacy-wonderland-flag" aria-hidden="true"></span><span class="legacy-wonderland-code">+999</span>' : ""}<input id="showcase-phone" type="tel" autocomplete="tel" aria-invalid="false" aria-describedby="phone-guidance" class="legacy-phone-input">${config.appEnv === "stage" ? "</div>" : ""}</div><p id="phone-guidance" role="status" class="legacy-phone-guidance">Enter a phone number to enable verification methods.</p>`;
    const body =
      tab === "identity"
        ? `<div class="legacy-identity-direct">${methods
            .filter((f) => !needsPhone(f))
            .map(button)
            .join(
              "",
            )}</div>${methods.some(needsPhone) ? phoneBox + `<div class="legacy-methods">${methods.filter(needsPhone).map(button).join("")}</div>` : ""}`
        : `${tab !== "login" ? phoneBox : ""}<div class="legacy-methods">${methods.map(button).join("")}</div>`;
    container.innerHTML = `<div class="legacy-shell"><header class="legacy-header"><a href="/auth/login" class="legacy-brand"><img class="legacy-brand-logo" width="326" height="70" src="${esc(config.logoUrl || "/images/logo/ipification-horizontal-black.svg")}" alt="${esc(config.locale.app.name)}"></a>${config.auth_servers.length > 1 ? `<div class="legacy-site"><span>Site</span><button id="site" type="button" role="combobox" aria-label="Authentication server" aria-expanded="false">${esc(server)}</button><div id="site-list" role="listbox" hidden>${config.auth_servers.map((s) => `<button type="button" role="option" data-server="${esc(s.id)}">${esc(s.id)}</button>`).join("")}</div></div>` : ""}</header><main class="legacy-main" aria-busy="false"><h1 class="sr-only">${esc(config.locale.app.name)}</h1><div role="tablist" aria-label="Authentication options" class="legacy-tabs" data-slot="tabs-list" style="grid-template-columns:repeat(${tabs.length},1fr)">${tabs.map((t) => `<button role="tab" data-slot="tabs-trigger" type="button" data-tab="${esc(t)}" data-state="${t === tab ? "active" : "inactive"}" aria-selected="${t === tab}">${esc(config.locale.tabs[t])}</button>`).join("")}</div><div class="legacy-section"><h2 class="legacy-section-title">${esc(section?.title)}</h2><p class="legacy-description">${esc(section?.description)}</p>${body}<p role="alert" class="legacy-inline-error" id="flow-error" hidden></p></div></main><footer class="legacy-footer"><div class="legacy-footer-links"><a href="https://www.ipification.com/legal" target="_blank" rel="noreferrer">${esc(config.locale.footer.privacy_policy)}</a><button type="button" id="about">${esc(config.locale.footer.about)}</button><a href="https://www.ipification.com/media/IPification%20-%20Showcase%20Guide%202.2.pdf" target="_blank" rel="noreferrer">${esc(config.locale.footer.help)}</a></div></footer></div>`;
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
        container.querySelector("#site-list").hidden = true;
      }),
    );
    const logo = container.querySelector(".legacy-brand-logo");
    if (config.logoUrl && config.logoStyle)
      logo.style.cssText = config.logoStyle;
    function updateConsent(country) {
      container.querySelector(".legacy-legal")?.remove();
      if (country !== "vn") return;
      const legal = document.createElement("p");
      legal.className = "legacy-legal";
      legal.append(
        document.createTextNode(config.locale.footer.viettel_legal + " "),
      );
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = config.locale.footer.viettel;
      button.style.textDecoration = "underline";
      button.onclick = () => {
        const dialog = document.createElement("dialog");
        dialog.className = "legacy-dialog legacy-consent-dialog";
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
      container.querySelector(".legacy-footer").prepend(legal);
    }
    updateConsent(config.appEnv === "stage" ? "ww" : defaultCountry);
    const input = container.querySelector("#showcase-phone");
    container.closest(".legacy-showcase").dataset.keyboardNavigation =
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
            .querySelectorAll(".legacy-method-phone")
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
          .querySelectorAll(".legacy-method-phone")
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
            if (!wrap.classList.contains("legacy-wonderland")) {
              const wonder = document.createElement("div");
              wonder.className = "iti legacy-wonderland";
              wonder.innerHTML =
                '<span class="legacy-wonderland-flag" aria-hidden="true"></span><span class="legacy-wonderland-code">+999</span>';
              input.before(wonder);
              wonder.append(input);
            }
            input.placeholder = "123456789";
          } else {
            if (wrap.classList.contains("legacy-wonderland")) {
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
            .querySelectorAll(".legacy-method-phone")
            .forEach((el) => (el.disabled = true));
        });
    }
    container
      .querySelectorAll(".legacy-method")
      .forEach((el) =>
        el.addEventListener("click", () =>
          start(config.clients.find((c) => c.user_flow === el.id)),
        ),
      );
    container.querySelector("#about")?.addEventListener("click", () => {
      const selected = config.auth_servers.find((item) => item.id === server),
        dialog = document.createElement("dialog");
      dialog.className = "legacy-dialog legacy-about-dialog";
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
    container.querySelectorAll(".legacy-method").forEach((button) => {
      button.disabled = needsPhone(button.id) && !phone;
      button.setAttribute("aria-busy", "false");
    });
  }
  async function start(client) {
    if (activeFlow) return;
    if (needsPhone(client.user_flow) && !valid) {
      const error = container.querySelector("#flow-error");
      error.hidden = false;
      error.textContent = config.locale.modals.phone_invalid;
      return;
    }
    const token = {};
    activeFlow = token;
    container.querySelectorAll(".legacy-method").forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-busy", String(button.id === client.user_flow));
    });
    if (client.user_flow === "pvn_sms")
      return showSms(client, token, { phone, server, endFlow, jsonPost });
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
        const error = container.querySelector("#flow-error");
        error.hidden = false;
        error.textContent = "Unable to open verification. Please try again.";
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
  document.querySelector(".legacy-loading").remove();
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
    .then(({ error_message: message }) => {
      if (!message) return;
      const dialog = document.createElement("dialog");
      dialog.className = "legacy-callback-error";
      dialog.setAttribute("aria-label", message);
      const title = document.createElement("h2");
      title.textContent = message;
      dialog.append(title);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
      dialog.addEventListener("close", () => dialog.remove());
      document.body.append(dialog);
      dialog.showModal();
    })
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
  const loading = document.querySelector(".legacy-loading");
  if (loading)
    loading.textContent =
      "Showcase is not ready. Check runtime configuration and retry.";
}
