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
  return `<div class="legacy-shell"><header class="legacy-header"><a href="/auth/login" class="legacy-brand"><img class="legacy-brand-logo" width="326" height="70" src="${esc(config.logoUrl || "/images/logo/ipification-horizontal-black.svg")}" alt="${esc(config.locale.app.name)}"></a>${config.auth_servers.length > 1 ? `<div class="legacy-site"><span>Site</span><button id="site" type="button" role="combobox" aria-label="Authentication server" aria-expanded="false">${esc(server)}</button><div id="site-list" role="listbox" hidden>${config.auth_servers.map((s) => `<button type="button" role="option" data-server="${esc(s.id)}">${esc(s.id)}</button>`).join("")}</div></div>` : ""}</header><main class="legacy-main" aria-busy="false"><h1 class="sr-only">${esc(config.locale.app.name)}</h1><div role="tablist" aria-label="Authentication options" class="legacy-tabs" data-slot="tabs-list" style="grid-template-columns:repeat(${tabs.length},1fr)">${tabs.map((t) => `<button role="tab" data-slot="tabs-trigger" type="button" data-tab="${esc(t)}" data-state="${t === tab ? "active" : "inactive"}" aria-selected="${t === tab}">${esc(config.locale.tabs[t])}</button>`).join("")}</div><div class="legacy-section"><h2 class="legacy-section-title">${esc(section?.title)}</h2><p class="legacy-description">${esc(section?.description)}</p>${body}<p role="alert" class="legacy-inline-error" id="flow-error" hidden></p></div></main><footer class="legacy-footer"><div class="legacy-footer-links"><a href="https://www.ipification.com/legal" target="_blank" rel="noreferrer">${esc(config.locale.footer.privacy_policy)}</a><button type="button" id="about">${esc(config.locale.footer.about)}</button><a href="https://www.ipification.com/media/IPification%20-%20Showcase%20Guide%202.2.pdf" target="_blank" rel="noreferrer">${esc(config.locale.footer.help)}</a></div></footer></div>`;
}
