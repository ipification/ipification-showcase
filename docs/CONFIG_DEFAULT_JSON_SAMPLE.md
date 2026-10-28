# default.json.sample configuration

> A separate Next.js application is being migrated in `showcase-next/`. See the [migration guide](NEXTJS_MIGRATION.md) for its runtime configuration, commands, compatibility limits and verification. The existing Express application remains available.


This document describes every field in `config/default.json.sample` and how to use it.

## Table of Contents

- [Quick Reference](#quick-reference)
- [How to use](#how-to-use)
- [Required Configuration](#required-configuration)
- [Optional Configuration](#optional-configuration)
- [auth_servers[] fields](#auth_servers-fields)
- [clients[] fields](#clients-fields)
- [Available User Flows](#available-user-flows)
- [locale fields](#locale-fields)
- [Troubleshooting](#troubleshooting)

## Quick Reference

**Minimum required configuration to start the app:**

```json
{
  "realm": "ipification",
  "auth_servers": [
    {
      "id": "stage",
      "url": "https://api.stage.ipification.com/auth"
    }
  ],
  "client_id": "your_client_id",
  "client_secret": "your_client_secret",
  "clients": [
    {
      "user_flow": "pvn_ip",
      "title": "IP Phone Number Verification",
      "scope": "openid ip:phone_verify"
    }
  ]
}
```

## How to use

1. Copy `config/default.json.sample` to `config/default.json`.
2. Fill in the values for your environment (especially `auth_servers` and client credentials).
3. Restart the app so the config is reloaded.

**⚠️ Important:** The `realm`, `auth_servers`, `client_id`, `client_secret`, and `clients` fields are **required**. The app will fail to start if these are not properly configured.

## Field reference

### Required Configuration

These fields **must** be configured for the app to start properly. The app will fail validation and crash on startup if any of these are missing or invalid.

- `realm` (string): Keycloak realm used in auth URLs (for example, `ipification`).

- `auth_servers` (array): List of authentication server configurations. Must contain at least one server. See [auth_servers[] fields](#auth_servers-fields) for details.

- `client_id` (string): Default OAuth client ID used as a fallback for all flows in the `clients` array.
  - Individual flows can override this by specifying their own `client_id`.
  - If a flow doesn't specify `client_id`, this root-level value is used.
  - **Recommended**: Use one client for all flows unless you have specific requirements.

- `client_secret` (string): Default OAuth client secret used as a fallback for all flows in the `clients` array.
  - Individual flows can override this by specifying their own `client_secret`.
  - If a flow doesn't specify `client_secret`, this root-level value is used.
  - **Recommended**: Use one client secret for all flows unless you have specific requirements.

- `clients` (array): List of client configurations, one per user flow. Each object describes a flow button and its OAuth client. See [clients[] fields](#clients-fields) for details.

### Optional Configuration

These fields are optional and have sensible defaults or can be left empty.

- `title` (string): Page title shown in the browser tab and some templates. Default: `"IPification Showcase"`.

- `app_logo_url` (string): Logo image URL. Can be a relative path in `public/` (like `/images/logo/vil.svg`) or an absolute URL. If not specified, only the app name is shown.

- `app_logo_style` (string): Inline CSS applied to the logo image in the login view (e.g. `width: 50px; height: 50px;`). Only applies if `app_logo_url` is set.

- `favicon_url` (string): URL to a favicon image (relative or absolute). If not specified, uses the default favicon at `/images/logo.ico`.

- `default_country_code` (string): Two-letter country code used when the phone country is not detected (e.g. `vn`). Default: `"rs"`.

- `disabled_select_country` (boolean): When `true`, disables the country selector UI and forces the default country. Default: `false`.

- `locale` (object): Optional overrides for UI text. See `docs/LOCALE.md` for full localization options. If not specified, uses default English locale.

---

### auth_servers[] fields

Each entry defines an authentication server that users can select from.

- `id` (string, **required**): Unique identifier for the auth server (e.g., `stage`, `live`, `prod`).
- `url` (string, **required**): Full base URL of the authentication server (e.g., `https://api.stage.ipification.com/auth`). Must be a valid URL format.

**Multiple Server Behavior:**

- If **1 server** is configured: The app uses it automatically without showing a dropdown.
- If **2+ servers** are configured: A dropdown selector appears on the login page allowing users to choose between servers. The selected server is saved to localStorage and persists across page reloads.

**Example configuration:**

```json
{
  "auth_servers": [
    {
      "id": "stage",
      "url": "https://api.stage.ipification.com/auth"
    },
    {
      "id": "live",
      "url": "https://api.ipification.com/auth"
    }
  ]
}
```

**Validation:**

- The `id` field must be unique across all servers
- The `url` field must be a valid URL format
- At least one server must be configured
- The app will crash on startup if validation fails

---

### clients[] fields

Each entry defines a user flow and its OAuth client credentials.

- `user_flow` (string, **required**): Unique flow ID used in routes and buttons (e.g. `pvn_ip`, `login_ip`, `kyc_phone`). Must be unique across all clients.

- `client_id` (string, optional): OAuth client ID for this specific flow.
  - **If specified**: Overrides the root-level `client_id` for this flow only.
  - **If not specified**: Uses the root-level `client_id` as fallback.
  - **Use case**: When different flows need different OAuth clients.

- `client_secret` (string, optional): OAuth client secret for this specific flow.
  - **If specified**: Overrides the root-level `client_secret` for this flow only.
  - **If not specified**: Uses the root-level `client_secret` as fallback.
  - **Use case**: When different flows need different OAuth clients.

- `title` (string, **required**): Display label for the flow button on the login page.

- `scope` (string, **required**): Space-separated scopes requested for the flow (for example, `openid ip:phone_verify`).

- `channel` (string, optional): Channel list for IM flows (space-separated, e.g. `wa viber telegram`). Only used for IM flows (`pvn_im`, `login_im`).

**Example: Using root-level credentials (recommended for most cases):**

```json
{
  "client_id": "default_client",
  "client_secret": "default_secret",
  "clients": [
    {
      "user_flow": "pvn_ip",
      "title": "IP Verification",
      "scope": "openid ip:phone_verify"
      // Uses client_id: "default_client" and client_secret: "default_secret"
    },
    {
      "user_flow": "login_ip",
      "title": "IP Login",
      "scope": "openid ip:phone"
      // Uses client_id: "default_client" and client_secret: "default_secret"
    }
  ]
}
```

**Example: Overriding credentials per flow:**

```json
{
  "client_id": "default_client",
  "client_secret": "default_secret",
  "clients": [
    {
      "user_flow": "pvn_ip",
      "title": "IP Verification",
      "scope": "openid ip:phone_verify"
      // Uses root-level: "default_client" and "default_secret"
    },
    {
      "user_flow": "pvn_im",
      "client_id": "im_client",
      "client_secret": "im_secret",
      "title": "IM Verification",
      "scope": "openid ip:phone_verify",
      "channel": "wa viber telegram"
      // Overrides with: "im_client" and "im_secret"
    },
    {
      "user_flow": "login_ip",
      "client_id": "login_client",
      "title": "IP Login",
      "scope": "openid ip:phone"
      // Overrides client_id but uses root-level client_secret
    }
  ]
}
```

---

### Available User Flows

| User Flow                  | Description                    | Scope                                 |
| -------------------------- | ------------------------------ | ------------------------------------- |
| `pvn_ip`                   | IP Phone Number Verification   | `openid ip:phone_verify`              |
| `pvn_ip_plus`              | IP+ Phone Number Verification  | `openid ip:phone_verify ip:mobile_id` |
| `pvn_im`                   | IM Phone Number Verification   | `openid ip:phone_verify`              |
| `pvn_ipificator`           | IP via App Verification        | `openid ip:phone_verify`              |
| `pvn_sim`                  | SIM Phone Number Verification  | `openid ip:phone_verify`              |
| `login_ip`                 | IP Login                       | `openid ip:phone`                     |
| `login_ip_plus`            | IP+ Login                      | `openid ip:mobile_id ip:phone`        |
| `login_im`                 | IM Login                       | `openid ip:phone`                     |
| `login_sim`                | SIM Login                      | `openid ip:phone`                     |
| `anonymous`                | Anonymous Identity             | `openid ip:mobile_id`                 |
| `kyc_phone`                | KYC Data                       | `openid ip:profile`                   |
| `sample_app_im_backchannel`| Sample IM Backchannel          | `openid`                              |

---

### locale fields

- `locale.app.name` (string): Overrides the application name used in the UI.
- `locale.tabs.pnv` (string): Label for the Phone Number Verification tab.
- `locale.tabs.login` (string): Label for the Login tab.

---

## Troubleshooting

### Configuration Errors

**Error: "Configuration error: auth_servers must be defined as an array in config"**

- Ensure `auth_servers` is present in your `default.json` and is an array.

**Error: "Configuration error: auth_servers must contain at least one server"**

- Add at least one server to the `auth_servers` array.

**Error: "Configuration error: auth_servers[0] must have an 'id' (string)"**

- Each server must have an `id` field with a string value.

**Error: "Configuration error: Duplicate auth server IDs found: stage"**

- Each server's `id` must be unique. Remove or rename duplicate IDs.
