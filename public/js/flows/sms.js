export async function showSms(client, token, { phone, server, endFlow, jsonPost, showError, isActive }) {
  const controller = new AbortController();
  let auth;
  try {
    const { response, data } = await jsonPost(
      "/sms/auth",
      { client_id: client.client_id, server_id: server, login_hint: phone, scope: "openid ip:phone_verify" },
      controller.signal,
    );
    if (!isActive(token)) return;
    if (!response.ok) throw new Error(errorMessage(data, "Unable to start SMS verification"));
    if (!data?.auth_req_id || !data?.nonce) throw new Error("Unable to start SMS verification");
    auth = { auth_req_id: data.auth_req_id, nonce: data.nonce };
  } catch (error) {
    if (isActive(token)) {
      endFlow(token);
      showError(error.message || "Unable to start SMS verification");
    }
    return;
  }

  const dialog = document.createElement("dialog");
  dialog.className = "showcase-dialog showcase-sms-dialog";
  dialog.dataset.slot = "dialog-content";
  dialog.setAttribute("aria-labelledby", "sms-title");
  dialog.innerHTML = '<header data-slot="dialog-header"><h2 id="sms-title" data-slot="dialog-title">Enter OTP code</h2><p>Enter the verification code sent to your phone.</p></header><form><label for="sms-code">OTP code</label><input id="sms-code" autocomplete="one-time-code" inputmode="numeric" placeholder="Enter code"><div class="showcase-sms-actions"><button type="button">Cancel</button><button type="submit" disabled>Verify</button></div></form>';
  const input = dialog.querySelector("input"),
    form = dialog.querySelector("form"),
    submit = dialog.querySelector('[type="submit"]');
  let inFlight = false;
  dialog.querySelector('[type="button"]').onclick = () => {
    controller.abort();
    endFlow(token);
    dialog.close();
  };
  dialog.addEventListener("cancel", () => {
    controller.abort();
    endFlow(token);
  });
  dialog.addEventListener("close", () => {
    controller.abort();
    endFlow(token);
    dialog.remove();
  });
  input.oninput = () => {
    input.value = input.value.replace(/\D/g, "");
    submit.disabled = inFlight || !input.value;
  };
  async function verify(code) {
    if (inFlight || !code) return;
    inFlight = true;
    submit.disabled = true;
    submit.textContent = "Verifying…";
    try {
      const { response, data } = await jsonPost(
        "/sms/token", { ...auth, client_id: client.client_id, server_id: server, code }, controller.signal,
      );
      if (!response.ok) throw new Error(errorMessage(data, "Unable to verify OTP code"));
      location.assign("/user/info");
    } catch (e) {
      if (!controller.signal.aborted) {
        showError(e.message || "Unable to verify OTP code");
      }
    } finally {
      inFlight = false;
      if (!controller.signal.aborted) {
        submit.disabled = !input.value;
        submit.textContent = "Verify";
      }
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    if (input.value) void verify(input.value);
  };
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
  if ("OTPCredential" in window && navigator.credentials?.get)
    navigator.credentials
      .get({ otp: { transport: ["sms"] }, signal: controller.signal })
      .then((credential) => {
        if (credential?.code && !controller.signal.aborted) {
          input.value = credential.code.replace(/\D/g, "");
          void verify(input.value);
        }
      })
      .catch(() => {});
}

function errorMessage(data, fallback) {
  if (typeof data === "string") return data.trim() || fallback;
  return data?.error_description || data?.data?.error_description || data?.message || data?.error || fallback;
}
