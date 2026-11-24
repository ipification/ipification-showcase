export async function startSim(
  client,
  token,
  { getActiveSim, setActiveSim, server, phone, container, endFlow, jsonPost, showError },
) {
  if (getActiveSim()) return;
  const login = client.user_flow === "login_sim",
    controller = new AbortController();
  const attempt = { controller };
  setActiveSim(attempt);
  const button = container.querySelector(`#${client.user_flow}`);
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  const pending = document.createElement("div");
  pending.className = "showcase-pending";
  pending.innerHTML =
    '<p role="status">Waiting for SIM verification…</p><button type="button">Cancel</button>';
  container.querySelector(".showcase-section").append(pending);
  function release() {
    if (getActiveSim() !== attempt) return;
    setActiveSim(null);
    endFlow(token);
    pending.remove();
  }
  pending.querySelector("button").onclick = () => {
    controller.abort();
    release();
  };
  try {
    const { response, data } = await jsonPost(
      "/ts43/auth",
      {
        client_id: client.client_id,
        server_id: server,
        login_hint: login ? "anonymous" : phone,
        carrier_hint: 51010,
        scope: login ? "openid ip:phone" : "openid ip:phone_verify",
        ...(login ? { operation: "GetPhoneNumber" } : {}),
      },
      controller.signal,
    );
    if (!response.ok)
      throw new Error(data.error || "Unable to start SIM verification");
    const credential = await navigator.credentials.get({
      digital: { requests: [data.digital_request] },
      signal: controller.signal,
    });
    if (getActiveSim() !== attempt) return;
    if (!credential) throw new Error("SIM verification was cancelled.");
    const vp = (credential.token || credential.data)?.vp_token?.[
      "ipification.com"
    ]?.[0];
    if (!vp)
      throw new Error(
        "This browser did not return a supported SIM credential. Choose another method.",
      );
    await jsonPost(
      "/ts43/token",
      {
        vp_token: vp,
        auth_req_id: data.auth_req_id,
        client_id: client.client_id,
        server_id: server,
        nonce: data.nonce,
      },
      controller.signal,
    );
    location.assign("/user/info");
  } catch (error) {
    if (getActiveSim() === attempt) {
      showError(error.message || "SIM verification is unavailable.");
    }
  } finally {
    release();
  }
}
