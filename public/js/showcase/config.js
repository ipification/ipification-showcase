export const storage = {
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
export const groups = {
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
export const keys = {
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
export const needsPhone = (flow) =>
  flow.startsWith("pvn_") || flow === "kyc_phone";
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
