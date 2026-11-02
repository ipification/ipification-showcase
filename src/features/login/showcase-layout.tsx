"use client";
import Image from "next/image";
import type { PublicShowcaseConfig } from "@/shared/contracts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ServerSelect } from "./server-select";
import { InfoDialogs } from "./info-dialogs";

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

export function ShowcaseHeader({
  config,
  serverId,
  onServerChange,
}: {
  config: PublicShowcaseConfig;
  serverId: string;
  onServerChange: (value: string) => void;
}) {
  return (
    <header className="legacy-header">
      <a href="/auth/login" className="legacy-brand">
        <Image
          unoptimized
          src={
            config.logoUrl || "/images/logo/ipification-horizontal-black.svg"
          }
          width={326}
          height={70}
          alt={config.locale.app.name}
          style={config.logoUrl ? logoStyle(config.logoStyle) : undefined}
          className="legacy-brand-logo"
        />
      </a>
      {config.auth_servers.length > 1 && (
        <div className="legacy-site">
          <span>Site</span>
          <ServerSelect
            servers={config.auth_servers}
            value={serverId}
            onChange={onServerChange}
          />
        </div>
      )}
    </header>
  );
}

export function ShowcaseFooter({
  config,
  serverId,
  country,
}: {
  config: PublicShowcaseConfig;
  serverId: string;
  country: string;
}) {
  return (
    <footer className="legacy-footer">
      {country === "vn" && (
        <p className="legacy-legal">
          {config.locale.footer.viettel_legal}{" "}
          <Dialog>
            <DialogTrigger className="underline">
              {config.locale.footer.viettel}
            </DialogTrigger>
            <DialogContent className="legacy-dialog legacy-consent-dialog">
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
      <div className="legacy-footer-links">
        <a
          href="https://www.ipification.com/legal"
          target="_blank"
          rel="noreferrer"
        >
          {config.locale.footer.privacy_policy}
        </a>
        <InfoDialogs
          server={config.auth_servers.find((s) => s.id === serverId)}
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
  );
}
