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
  invalid,
  describedBy,
}: {
  country?: string;
  disabledCountrySelection?: boolean;
  appEnv: string;
  onChange: (value: PhoneValue) => void;
  invalid?: boolean;
  describedBy?: string;
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
        // Legacy entry accepts digits while editing; validate when a method is activated.
        strictMode: false,
        formatAsYouType: false,
        loadUtils: () => import("intl-tel-input/utils"),
        customPlaceholder: (placeholder, data) =>
          data?.dialCode === "999" ? "123456789" : placeholder,
      });
      const update = () => {
        const selected = iti.getSelectedCountry();
        if (!selected) return;
        const digits = input.value.replace(/[^0-9]/g, "");
        input.value = digits;
        change.current({
          number: !digits
            ? ""
            : selected.dialCode === "999"
              ? "999" + digits
              : (iti.getNumber() || selected.dialCode + digits).replace(
                  /[ +]/g,
                  "",
                ),
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
    <div className="legacy-phone">
      <Label className="sr-only" htmlFor="showcase-phone">
        Phone number
      </Label>
      <input
        ref={ref}
        id="showcase-phone"
        type="tel"
        autoComplete="tel"
        aria-invalid={!!invalid}
        aria-describedby={describedBy}
        className="legacy-phone-input"
      />
    </div>
  );
}

interface PhoneProps {
  invalid?: boolean;
  describedBy?: string;
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
    <div className="legacy-phone legacy-stage-phone">
      <Label className="sr-only" htmlFor="stage-country">
        Country
      </Label>
      <select
        id="stage-country"
        title="Choose country"
        className="legacy-stage-country"
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
        <div className="legacy-phone">
          <Label className="sr-only" htmlFor="showcase-phone">
            Phone number
          </Label>
          <div className="iti legacy-wonderland">
            <span className="legacy-wonderland-flag" aria-hidden="true" />
            <span className="legacy-wonderland-code">+999</span>
            <input
              id="showcase-phone"
              className="legacy-phone-input"
              type="tel"
              autoComplete="tel-national"
              aria-invalid={!!props.invalid}
              aria-describedby={props.describedBy}
              placeholder="123456789"
              value={value}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setValue(digits);
                props.onChange({
                  number: digits ? "999" + digits : "",
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
