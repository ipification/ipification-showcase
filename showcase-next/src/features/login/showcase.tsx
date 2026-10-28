"use client";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  ShieldCheck,
  Smartphone,
  LogIn,
  Fingerprint,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { PublicClient, PublicShowcaseConfig } from "@/shared/contracts";
import {
  flowGroups,
  labelKey,
  needsPhone,
  type Tab,
} from "@/shared/flow-catalog";
import { PhoneInput, type PhoneValue } from "@/features/phone/phone-input";
import { QrDialog } from "@/features/qr/qr-dialog";
import { ServerSelect } from "./server-select";
import { InfoDialogs } from "./info-dialogs";
import { LoginError } from "./login-error";
import { usePreferences } from "./use-preferences";
import { SmsDialog } from "@/features/sms/sms-dialog";
import type { SmsInput } from "@/features/sms/use-sms-flow";
import { useTs43Flow } from "@/features/ts43/use-ts43-flow";
const tabIcons = { pnv: ShieldCheck, login: LogIn, identity: Fingerprint };
function logoStyle(value?: string): React.CSSProperties {
  const entries = (value || "max-width:100%").split(";").flatMap((part) => {
    const colon = part.indexOf(":");
    if (colon < 0) return [];
    const name = part.slice(0, colon).trim(),
      value = part.slice(colon + 1).trim();
    return name && value
      ? [
          [
            name.replace(/-([a-z])/g, (_, letter: string) =>
              letter.toUpperCase(),
            ),
            value,
          ],
        ]
      : [];
  });
  return Object.fromEntries(entries);
}
export function Showcase({ config }: { config: PublicShowcaseConfig }) {
  const [sms, setSms] = useState<SmsInput | null>(null);
  const ts43 = useTs43Flow();
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
    }),
    [country, setCountry] = useState(config.defaultCountry || "rs"),
    [mobile, setMobile] = useState(false),
    [error, setError] = useState(""),
    [qr, setQr] = useState<{
      state: string;
      url: string;
      title: string;
    } | null>(null);
  useEffect(() => {
    const resize = () =>
      setMobile(
        window.innerWidth <= 768 ||
          /Android|iPhone|Mobile/i.test(navigator.userAgent),
      );
    resize();
    window.addEventListener("resize", resize);
    if (!config.defaultCountry && config.appEnv !== "stage")
      fetch("/api/geoip")
        .then((r) => r.json())
        .then((data) => setCountry(data.country || "rs"))
        .catch(() => {});
    return () => window.removeEventListener("resize", resize);
  }, [config.defaultCountry, config.appEnv]);
  function start(client: PublicClient) {
    setError("");
    if (!preferences.serverId) {
      setError("Please select an auth server");
      return;
    }
    if (needsPhone(client.user_flow) && !phone.valid) {
      setError(config.locale.modals.phone_invalid);
      return;
    }
    if (client.user_flow === "pvn_sms") {
      setSms({
        clientId: client.client_id,
        serverId: preferences.serverId,
        phone: phone.number,
      });
      return;
    }
    if (client.user_flow === "pvn_sim" || client.user_flow === "login_sim") {
      void ts43.start({
        clientId: client.client_id,
        serverId: preferences.serverId,
        phone: phone.number,
        login: client.user_flow === "login_sim",
      });
      return;
    }
    const isQr = !mobile && !["pvn_im", "login_im"].includes(client.user_flow),
      state = crypto.randomUUID() + (isQr ? "-qrcode" : "");
    const params = new URLSearchParams({
      user_flow: client.user_flow,
      server_id: preferences.serverId,
      state,
    });
    if (needsPhone(client.user_flow)) params.set("phone", phone.number);
    const url = new URL("/auth/start?" + params, location.origin).href;
    if (isQr)
      setQr({ state, url, title: client.title || "Verify your identity" });
    else location.assign(url);
  }
  const section = config.locale.sections[preferences.tab],
    flows = flowGroups[preferences.tab] || [];
  return (
    <div
      className="min-h-screen"
      style={
        config.primaryColor
          ? ({ "--primary": config.primaryColor } as React.CSSProperties)
          : undefined
      }
    >
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5">
          <a href="/auth/login" className="flex items-center gap-3">
            <span className="rounded-xl bg-primary p-2.5 text-white">
              <ShieldCheck size={25} />
            </span>
            <span className="text-sm font-bold tracking-wide">
              IPIFICATION
              <span className="ml-2 font-normal text-muted-foreground">
                / Showcase
              </span>
            </span>
          </a>
          <ServerSelect
            servers={config.auth_servers}
            value={preferences.serverId}
            onChange={preferences.selectServer}
          />
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-10 px-5 py-10 md:grid-cols-[1fr_1.1fr] md:items-center md:gap-16 md:py-20">
        <section className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <Smartphone size={14} /> Mobile identity
          </span>
          {config.logoUrl ? (
            <Image
              unoptimized
              width={320}
              height={80}
              src={config.logoUrl}
              style={logoStyle(config.logoStyle)}
              alt={config.locale.app.name}
              className="max-h-20 max-w-full"
            />
          ) : null}
          <h1 className="text-4xl leading-tight font-semibold tracking-tight md:text-5xl">
            {config.locale.app.name}
          </h1>
          <p className="max-w-sm text-base leading-relaxed text-muted-foreground">
            Explore phone verification, quick access and identity services
            through your mobile network.
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck size={16} />
            <span>Powered by IPification</span>
          </div>
        </section>
        <Card className="overflow-hidden border bg-white shadow-xl shadow-slate-200/40">
          <CardContent className="space-y-6 p-6 sm:p-8">
            <Tabs
              value={preferences.tab}
              onValueChange={(v) => {
                preferences.selectTab(v as Tab);
                setPhone({ number: "", valid: false, country });
                setError("");
                setQr(null);
                setSms(null);
                ts43.cancel();
              }}
            >
              <TabsList
                className="showcase-tabs grid w-full"
                style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }}
              >
                {tabs.map((tab) => {
                  const Icon = tabIcons[tab];
                  return (
                    <TabsTrigger key={tab} value={tab}>
                      <Icon aria-hidden="true" />
                      <span>{config.locale.tabs[tab]}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
            <LoginError />
            <div>
              <h2 className="text-xl font-semibold">{section?.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {section?.description}
              </p>
            </div>
            {preferences.tab !== "login" && (
              <PhoneInput
                key={preferences.tab}
                country={country}
                appEnv={config.appEnv}
                disabledCountrySelection={config.disabledSelectCountry}
                onChange={setPhone}
              />
            )}
            <div className="grid gap-3">
              {flows.map((flow) => {
                const client = config.clients.find((c) => c.user_flow === flow);
                if (!client || (flow === "pvn_ipificator" && !mobile))
                  return null;
                const key = labelKey(flow);
                return (
                  <Button
                    key={flow}
                    variant={flow.includes("plus") ? "outline" : "default"}
                    className="h-12 justify-between text-sm"
                    disabled={
                      ts43.pending || (needsPhone(flow) && !phone.valid)
                    }
                    onClick={() => start(client)}
                  >
                    <span>
                      {config.locale.buttons[key || ""] || client.title || flow}
                    </span>
                    <ArrowUpRight size={17} />
                  </Button>
                );
              })}
            </div>
            {(error || ts43.error) && (
              <p role="alert" className="text-sm text-destructive">
                {error || ts43.error}
              </p>
            )}
            {ts43.pending && (
              <div className="flex items-center justify-between gap-3">
                <p role="status" className="text-sm">
                  Waiting for SIM verification…
                </p>
                <Button variant="outline" onClick={ts43.cancel}>
                  Cancel
                </Button>
              </div>
            )}
            <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
              Choose a method to explore the authentication flow.
            </p>
          </CardContent>
        </Card>
      </main>
      <footer className="mx-auto max-w-5xl space-y-5 px-5 pb-8 text-xs text-muted-foreground">
        {phone.country === "vn" && (
          <p className="max-w-3xl leading-relaxed">
            {config.locale.footer.viettel_legal}{" "}
            <Dialog>
              <DialogTrigger className="text-primary underline">
                {config.locale.footer.viettel}
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Viettel consent</DialogTitle>
                </DialogHeader>
                <iframe
                  title="Viettel consent"
                  src="https://www.ipification.com/consents/vn-viettel-001-vi.html"
                  className="h-[60vh] w-full"
                />
              </DialogContent>
            </Dialog>{" "}
            in case you are Viettel subscribers.
          </p>
        )}
        <div className="flex flex-wrap gap-5">
          <a
            href="https://www.ipification.com/legal"
            target="_blank"
            rel="noreferrer"
          >
            {config.locale.footer.privacy_policy}
          </a>
          <InfoDialogs
            server={config.auth_servers.find(
              (s) => s.id === preferences.serverId,
            )}
            locale={config.locale}
          />
          <a
            href="https://www.ipification.com/media/IPification%20-%20Showcase%20Guide%202.2.pdf"
            target="_blank"
            rel="noreferrer"
          >
            {config.locale.footer.help}
          </a>
        </div>
      </footer>
      {sms && <SmsDialog input={sms} onClose={() => setSms(null)} />}{" "}
      {qr && (
        <QrDialog
          key={qr.state}
          state={qr.state}
          authUrl={qr.url}
          title={qr.title}
          onClose={() => setQr(null)}
        />
      )}
    </div>
  );
}
