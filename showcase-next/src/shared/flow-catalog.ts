export const flowGroups = {
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
} as const;
export type Tab = keyof typeof flowGroups;
export function labelKey(flow: string) {
  return {
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
  }[flow];
}
export function needsPhone(flow: string) {
  return flow.startsWith("pvn_") || flow === "kyc_phone";
}
