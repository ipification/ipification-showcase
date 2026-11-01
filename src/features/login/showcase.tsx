"use client";
import "./legacy-showcase.css";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PublicShowcaseConfig } from "@/shared/contracts";
import {
  flowGroups,
  labelKey,
  needsPhone,
  type Tab,
} from "@/shared/flow-catalog";
import { PhoneInput, type PhoneValue } from "@/features/phone/phone-input";
import { QrDialog } from "@/features/qr/qr-dialog";
import { SmsDialog } from "@/features/sms/sms-dialog";
import { LoginError } from "./login-error";
import { usePreferences } from "./use-preferences";
import { useShowcaseBrowser } from "./use-showcase-browser";
import { useVerification } from "./use-verification";
import { ShowcaseHeader, ShowcaseFooter } from "./showcase-layout";

// The screen only selects a configured method; useVerification owns the flow.
export function Showcase({ config }: { config: PublicShowcaseConfig }) {
  const { country, mobile, keyboardNavigation } = useShowcaseBrowser(
    config.defaultCountry,
    config.appEnv,
  );
  const tabs = useMemo(
    () =>
      (Object.keys(flowGroups) as Tab[]).filter((tab) =>
        flowGroups[tab].some((flow) =>
          config.clients.some((c) => c.user_flow === flow),
        ),
      ),
    [config.clients],
  );
  const servers = useMemo(
    () => config.auth_servers.map((s) => s.id),
    [config.auth_servers],
  );
  const preferences = usePreferences(tabs, servers);
  const [phone, setPhone] = useState<PhoneValue>({
    number: "",
    valid: false,
    country: config.defaultCountry || "rs",
  });
  const [phoneTouched, setPhoneTouched] = useState(false);
  const verification = useVerification({
    serverId: preferences.serverId,
    phone,
    mobile,
    invalidPhoneMessage: config.locale.modals.phone_invalid,
  });
  const { activeFlow, qr, sms, error, sim } = verification;
  const section = config.locale.sections[preferences.tab],
    flows = flowGroups[preferences.tab] || [];
  function renderMethod(flow: string) {
    const client = config.clients.find((c) => c.user_flow === flow);
    if (!client || (flow === "pvn_ipificator" && !mobile)) return null;
    const key = labelKey(flow);
    const label =
      section?.[`button_${key}_label`] ||
      config.locale.buttons[key || ""] ||
      client.title ||
      flow;
    return (
      <Button
        key={flow}
        id={flow}
        aria-label={label}
        aria-busy={activeFlow === flow}
        variant="outline"
        className={`legacy-method ${needsPhone(flow) ? "legacy-method-phone" : "legacy-method-direct"}`}
        disabled={
          !!activeFlow ||
          !!qr ||
          !!sms ||
          sim.pending ||
          (needsPhone(flow) && !phone.number)
        }
        onClick={() => verification.startVerification(client)}
      >
        <span>{label}</span>
        {activeFlow === flow ? (
          <span className="legacy-method-progress" aria-hidden="true">
            <span className="legacy-spinner" />
            {sim.pending ? "Verifying…" : "Opening…"}
          </span>
        ) : (
          <span className="legacy-method-arrow" aria-hidden="true" />
        )}
      </Button>
    );
  }
  const phoneInvalid = phoneTouched && !!phone.number && !phone.valid;
  const phoneInput = (
    <div onBlurCapture={() => setPhoneTouched(true)}>
      <PhoneInput
        key={preferences.tab}
        country={country}
        appEnv={config.appEnv}
        disabledCountrySelection={config.disabledSelectCountry}
        onChange={setPhone}
        invalid={phoneInvalid}
        describedBy="phone-guidance"
      />
      <p
        id="phone-guidance"
        role="status"
        className={`legacy-phone-guidance ${phoneInvalid ? "legacy-inline-error" : ""}`}
      >
        {phoneInvalid
          ? "Enter a valid phone number for the selected country."
          : phone.valid
            ? "Phone number is ready. Choose a verification method."
            : phone.number
              ? "Choose a verification method to check this phone number."
              : "Enter a phone number to enable verification methods."}
      </p>
    </div>
  );
  if (!preferences.ready) {
    return (
      <div className="legacy-showcase">
        <main className="legacy-loading" aria-busy="true">
          <div role="status" className="legacy-loading-content">
            <span className="legacy-loading-spinner" aria-hidden="true" />
            <span>Loading…</span>
          </div>
        </main>
      </div>
    );
  }
  return (
    <div
      className="legacy-showcase"
      data-tab={preferences.tab}
      data-phone-valid={phone.valid}
      data-keyboard-navigation={keyboardNavigation}
    >
      <div className="legacy-shell">
        <ShowcaseHeader
          config={config}
          serverId={preferences.serverId}
          onServerChange={preferences.selectServer}
        />
        <main className="legacy-main" aria-busy={!preferences.ready}>
          <h1 className="sr-only">{config.locale.app.name}</h1>
          <Tabs
            value={preferences.tab}
            onValueChange={(v) => {
              preferences.selectTab(v as Tab);
              setPhone({ number: "", valid: false, country });
              setPhoneTouched(false);
              verification.resetForTab();
            }}
          >
            <TabsList
              aria-label="Authentication options"
              className="legacy-tabs"
              style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }}
            >
              {tabs.map((tab) => (
                <TabsTrigger key={tab} value={tab}>
                  {config.locale.tabs[tab]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="legacy-section">
            <LoginError />
            <h2 className="legacy-section-title">{section?.title}</h2>
            <p className="legacy-description">{section?.description}</p>
            {preferences.tab === "identity" ? (
              <>
                <div className="legacy-identity-direct">
                  {flows.filter((flow) => !needsPhone(flow)).map(renderMethod)}
                </div>
                {flows.some(
                  (flow) =>
                    needsPhone(flow) &&
                    config.clients.some((client) => client.user_flow === flow),
                ) && (
                  <>
                    {phoneInput}
                    <div className="legacy-methods">
                      {flows.filter(needsPhone).map(renderMethod)}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {preferences.tab !== "login" && phoneInput}
                <div className="legacy-methods">{flows.map(renderMethod)}</div>
              </>
            )}
            {(error || sim.error) && (
              <p role="alert" className="legacy-inline-error">
                {error || sim.error}
              </p>
            )}
            {sim.pending && (
              <div className="legacy-pending">
                <p role="status">Waiting for SIM verification…</p>
                <Button
                  variant="outline"
                  onClick={verification.cancelSimVerification}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </main>
        <ShowcaseFooter
          config={config}
          serverId={preferences.serverId}
          country={phone.country}
        />
      </div>
      {sms && <SmsDialog input={sms} onClose={verification.closeSms} />}
      {qr && (
        <QrDialog
          key={qr.state}
          state={qr.state}
          expiresAt={qr.expiresAt}
          authUrl={qr.url}
          title={qr.title}
          onClose={verification.closeQr}
          onRefresh={verification.refreshQr}
        />
      )}
    </div>
  );
}
