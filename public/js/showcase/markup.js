import { groups, keys, needsPhone, esc } from "./config.js";

export function showcaseMarkup({
  config,
  tab,
  server,
  tabs,
  countryNames,
  intlTelInput,
}) {
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
    return `<button id="${esc(flow)}" type="button" ${flow === "pvn_ipificator" && !mobile ? "hidden" : ""} class="showcase-method ${needsPhone(flow) ? "showcase-method-phone" : "showcase-method-direct"}" ${needsPhone(flow) ? "disabled" : ""}><span>${esc(label)}</span><span class="showcase-method-arrow" aria-hidden="true"></span></button>`;
  };
  const countryPicker =
    config.appEnv === "stage"
      ? `<select id="stage-country" hidden aria-label="Country" ${config.disabledSelectCountry ? "disabled" : ""}><option value="ww">Wonderland (+999)</option>${intlTelInput
          .getAllCountries()
          .map(
            (c) =>
              `<option value="${esc(c.iso2)}">${esc(countryNames.of(c.iso2.toUpperCase()) || c.iso2)} (+${esc(c.dialCode)})</option>`,
          )
          .join(
            "",
          )}</select><button id="stage-country-trigger" type="button" class="showcase-stage-country" aria-label="Change country for phone number" aria-haspopup="dialog" aria-expanded="false" ${config.disabledSelectCountry ? "disabled" : ""}></button><div class="showcase-country-menu" role="dialog" aria-label="Choose country" hidden><input class="showcase-country-search" type="search" aria-label="Search country" placeholder="Search"><ul class="showcase-country-list" role="listbox" aria-label="Countries"></ul></div>`
      : "";
  const phoneBox = `<div class="showcase-phone ${config.appEnv === "stage" ? "showcase-stage-phone" : ""}"><label class="sr-only" for="showcase-phone">Phone number</label>${countryPicker}${config.appEnv === "stage" ? '<div class="iti showcase-wonderland"><span class="showcase-wonderland-flag" aria-hidden="true"></span><span class="showcase-wonderland-code">+999</span>' : ""}<input id="showcase-phone" type="tel" autocomplete="tel" aria-invalid="false" aria-describedby="phone-guidance" class="showcase-phone-input">${config.appEnv === "stage" ? "</div>" : ""}</div><p id="phone-guidance" role="status" class="showcase-phone-guidance">Enter a phone number to enable verification methods.</p>`;
  const body =
    tab === "identity"
      ? `<div class="showcase-identity-direct">${methods
          .filter((f) => !needsPhone(f))
          .map(button)
          .join(
            "",
          )}</div>${methods.some(needsPhone) ? phoneBox + `<div class="showcase-methods">${methods.filter(needsPhone).map(button).join("")}</div>` : ""}`
      : `${tab !== "login" ? phoneBox : ""}<div class="showcase-methods">${methods.map(button).join("")}</div>`;
  return `<div class="showcase-shell"><header class="showcase-header"><a href="/auth/login" class="showcase-brand"><span class="showcase-brand-logo">${esc(config.locale.app.name)}</span></a>${config.auth_servers.length > 1 ? `<div class="showcase-site"><span>Site</span><button id="site" type="button" role="combobox" aria-label="Authentication server" aria-expanded="false" aria-controls="site-list">${esc(server)}</button><div id="site-list" role="listbox" aria-label="Authentication server" hidden>${config.auth_servers.map((s) => `<button type="button" role="option" aria-selected="${s.id === server}" data-server="${esc(s.id)}">${esc(s.id)}</button>`).join("")}</div></div>` : ""}</header><main class="showcase-main" aria-busy="false"><h1 class="sr-only">${esc(config.locale.app.name)}</h1><div role="tablist" aria-label="Authentication options" class="showcase-tabs" data-slot="tabs-list" style="grid-template-columns:repeat(${tabs.length},1fr)">${tabs.map((t) => `<button role="tab" data-slot="tabs-trigger" type="button" data-tab="${esc(t)}" data-state="${t === tab ? "active" : "inactive"}" aria-selected="${t === tab}">${esc(config.locale.tabs[t])}</button>`).join("")}</div><div class="showcase-section"><h2 class="showcase-section-title">${esc(section?.title)}</h2><p class="showcase-description">${esc(section?.description)}</p>${body}</div></main><footer class="showcase-footer"><div class="showcase-footer-links"><a href="https://www.ipification.com/legal" target="_blank" rel="noreferrer">${esc(config.locale.footer.privacy_policy)}</a><button type="button" id="about">${esc(config.locale.footer.about)}</button><a href="https://www.ipification.com/media/IPification%20-%20Showcase%20Guide%202.2.pdf" target="_blank" rel="noreferrer">${esc(config.locale.footer.help)}</a></div></footer></div>`;
}
