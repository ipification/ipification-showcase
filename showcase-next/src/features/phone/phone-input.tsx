"use client";
import { useEffect, useRef, useState } from "react";
import type { Iso2 } from "intl-tel-input";
import { Label } from "@/components/ui/label";
export interface PhoneValue {
  number: string;
  valid: boolean;
  country: string;
}
function InternationalPhoneInput({
  country = "rs",
  disabledCountrySelection = false,
  appEnv,
  onChange,
}: {
  country?: string;
  disabledCountrySelection?: boolean;
  appEnv: string;
  onChange: (value: PhoneValue) => void;
}) {
  const ref = useRef<HTMLInputElement>(null),
    change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);
  useEffect(() => {
    let dispose: undefined | (() => void),
      cancelled = false;
    import("intl-tel-input").then(({ default: intlTelInput }) => {
      if (cancelled || !ref.current) return;
      const input = ref.current;
      const iti = intlTelInput(input, {
        initialCountry: country as Iso2,
        countrySelectorMode: disabledCountrySelection ? "OFF" : "AUTO",
        countrySearch: !disabledCountrySelection,
        separateDialCode: true,
        loadUtils: () => import("intl-tel-input/utils"),
        customPlaceholder: (placeholder, data) =>
          data?.dialCode === "999" ? "123456789" : placeholder,
      });
      const update = () => {
        const selected = iti.getSelectedCountry();
        if (!selected) return;
        change.current({
          number:
            selected.dialCode === "999"
              ? "999" + input.value.replace(/\D/g, "")
              : (iti.getNumber() || "").replace(/[ +]/g, ""),
          valid:
            selected.dialCode === "999"
              ? !!input.value.trim()
              : !!iti.isValidNumber(),
          country: selected.iso2 || country,
        });
      };
      input.addEventListener("input", update);
      input.addEventListener("countrychange", update);
      iti.promise.then(() => {
        if (!cancelled) update();
      });
      dispose = () => {
        input.removeEventListener("input", update);
        input.removeEventListener("countrychange", update);
        iti.destroy();
      };
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [country, appEnv, disabledCountrySelection]);
  return (
    <div className="space-y-2">
      <Label htmlFor="showcase-phone">Phone number</Label>
      <input
        ref={ref}
        id="showcase-phone"
        type="tel"
        autoComplete="tel"
        className="h-12 w-full rounded-lg border bg-white px-3 text-base outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}

interface PhoneProps {
  country?: string;
  disabledCountrySelection?: boolean;
  appEnv: string;
  onChange: (value: PhoneValue) => void;
}
function StagePhoneInput(props: PhoneProps) {
  const [country, setCountry] = useState("ww"),
    [value, setValue] = useState("");
  const [countries, setCountries] = useState<
    { iso2: string; name: string; dialCode: string }[]
  >([]);
  useEffect(() => {
    let active = true;
    import("intl-tel-input").then(({ default: input }) => {
      if (active) {
        const names = new Intl.DisplayNames(["en"], { type: "region" });
        setCountries(
          input.getAllCountries().map((c) => ({
            iso2: c.iso2,
            name: names.of(c.iso2.toUpperCase()) || c.iso2,
            dialCode: c.dialCode,
          })),
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="space-y-3">
      <Label htmlFor="stage-country">Country</Label>
      <select
        id="stage-country"
        className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
        disabled={props.disabledCountrySelection}
        value={country}
        onChange={(e) => {
          setCountry(e.target.value);
          setValue("");
          props.onChange({ number: "", valid: false, country: e.target.value });
        }}
      >
        <option value="ww">Wonderland (+999)</option>
        {countries.map((c) => (
          <option key={c.iso2} value={c.iso2}>
            {c.name} (+{c.dialCode})
          </option>
        ))}
      </select>
      {country === "ww" ? (
        <div className="space-y-2">
          <Label htmlFor="showcase-phone">Phone number</Label>
          <div
            className="iti"
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <span className="text-sm text-muted-foreground">+999</span>
            <input
              id="showcase-phone"
              className="h-12 min-w-0 flex-1 rounded-lg border bg-white px-3"
              type="tel"
              placeholder="123456789"
              value={value}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setValue(digits);
                props.onChange({
                  number: "999" + digits,
                  valid: !!digits,
                  country: "ww",
                });
              }}
            />
          </div>
        </div>
      ) : (
        <InternationalPhoneInput
          {...props}
          country={country}
          appEnv="development"
          disabledCountrySelection
        />
      )}
    </div>
  );
}
export function PhoneInput(props: PhoneProps) {
  return props.appEnv === "stage" ? (
    <StagePhoneInput {...props} />
  ) : (
    <InternationalPhoneInput {...props} />
  );
}
