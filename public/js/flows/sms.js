export function showSms(client, token, { phone, server, endFlow, jsonPost }) {
  const dialog = document.createElement("dialog"),
    controller = new AbortController();
  dialog.className = "showcase-dialog showcase-sms-dialog";
  dialog.dataset.slot = "dialog-content";
  dialog.innerHTML =
    '<header data-slot="dialog-header"><h2 data-slot="dialog-title">Enter OTP code</h2><p>Enter the verification code sent to your phone.</p></header><form><label for="sms-code">OTP code</label><input id="sms-code" autocomplete="one-time-code" inputmode="numeric" disabled><p role="status">Sending code…</p><p role="alert" hidden></p><div><button type="button">Cancel</button><button type="button" data-retry hidden>Retry</button><button type="submit" disabled>Verify</button></div></form>';
  const input = dialog.querySelector("input"),
    form = dialog.querySelector("form"),
    error = dialog.querySelector('[role="alert"]'),
    status = dialog.querySelector('[role="status"]'),
    submit = dialog.querySelector('[type="submit"]');
  let auth,
    inFlight = false;
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
    if (inFlight || !auth || !code) return;
    inFlight = true;
    submit.disabled = true;
    error.hidden = true;
    try {
      const { response, data } = await jsonPost(
        "/sms/token",
        { ...auth, client_id: client.client_id, server_id: server, code },
        controller.signal,
      );
      await jsonPost(
        "/sms/log",
        { data: { type: "get_token_response", data } },
        controller.signal,
      );
      if (!response.ok)
        throw new Error(
          data.data?.error_description ||
            data.error ||
            "Unable to verify OTP code",
        );
      location.assign("/user/info");
    } catch (e) {
      if (!controller.signal.aborted) {
        error.textContent = e.message;
        error.hidden = false;
      }
    } finally {
      inFlight = false;
      if (!controller.signal.aborted) submit.disabled = !input.value;
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    if (auth && input.value) void verify(input.value);
  };
  document.body.append(dialog);
  dialog.showModal();
  async function sendCode() {
    error.hidden = true;
    status.hidden = false;
    dialog.querySelector("[data-retry]").hidden = true;
    try {
      const { response, data } = await jsonPost(
        "/sms/auth",
        {
          client_id: client.client_id,
          server_id: server,
          login_hint: phone,
          scope: "openid ip:phone_verify",
        },
        controller.signal,
      );
      if (!response.ok)
        throw new Error(data.error || "Unable to start SMS verification");
      auth = { auth_req_id: data.auth_req_id, nonce: data.nonce };
      input.disabled = false;
      status.hidden = true;
      input.focus();
      if ("OTPCredential" in window && navigator.credentials?.get)
        navigator.credentials
          .get({ otp: { transport: ["sms"] }, signal: controller.signal })
          .then((credential) => {
            if (credential?.code) {
              input.value = credential.code;
              void verify(credential.code);
            }
          })
          .catch(() => {});
    } catch (e) {
      if (!controller.signal.aborted) {
        status.hidden = true;
        error.hidden = false;
        error.textContent = e.message;
        dialog.querySelector("[data-retry]").hidden = false;
      }
    }
  }
  dialog.querySelector("[data-retry]").onclick = sendCode;
  void sendCode();
}
