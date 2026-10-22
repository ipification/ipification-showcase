# Quick Start Guide

This guide will help you get the IPification Showcase application up and running quickly.

## Table of Contents

- [Prerequisites Checklist](#prerequisites-checklist)
- [5-Minute Setup](#5-minute-setup)
  - [Step 1: Install Dependencies](#step-1-install-dependencies)
  - [Step 2: Configure Application](#step-2-configure-application)
  - [Step 3: Start the Server](#step-3-start-the-server)
  - [Step 4: Access the Application](#step-4-access-the-application)
- [Auth Server Selection](#auth-server-selection)
- [Testing Different Flows](#testing-different-flows)
  - [Phone Number Verification (PNV)](#phone-number-verification-pnv)
  - [Quick Access Login](#quick-access-login)
  - [Identity Services](#identity-services)
- [Common Issues](#common-issues)
- [Development Mode](#development-mode)
- [Environment Variables](#environment-variables)
- [Next Steps](#next-steps)
- [Getting Help](#getting-help)

---

## Prerequisites Checklist

- [ ] Node.js >= 24.0.0 installed (24.22.0 is pinned in `.tool-versions` and Docker)
- [ ] npm installed
- [ ] IPification account credentials

---

## 5-Minute Setup

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Application

```bash
cp config/default.json.sample config/default.json
```

For a full field reference, see [Sample Config Reference](CONFIG_DEFAULT_JSON_SAMPLE.md).

Edit `config/default.json` and add client configuration

### Step 3: Start the Server

```bash
npm start
```

### Step 4: Access the Application

1. Open browser and navigate to:

   ```
   http://localhost:3000
   ```

2. **Select Auth Server** (if multiple servers configured):
   - A dropdown appears at the top of the page showing available auth servers (e.g., "stage", "live")
   - Select the server you want to use for authentication
   - Your selection is saved and persists across page reloads

3. Click "IP" button in PNV tab to test authentication

---

## Auth Server Selection

If you configured multiple auth servers in `config/default.json`, you can switch between them:

1. **Dropdown Location**: Top of the login page, next to the logo
2. **Selection Persistence**: Your choice is saved to browser localStorage
3. **Reload Behavior**: The selected server remains active after page reload
4. **Per-Request**: Each authentication request uses your selected server

**Example Use Cases**:

- **Testing**: Switch between `stage` and `live` servers without config changes
- **Development**: Test against different environments easily
- **Demo**: Show different server behaviors to clients

**Single Server**: If only one server is configured, no dropdown appears - the app uses that server automatically.

---

## Testing Different Flows

### Phone Number Verification (PNV)

1. Go to **PNV** tab
2. Enter the phone number to verify
3. Click desired button:
   - **IP**: Carrier-based verification
   - **IP+**: Enhanced verification with mobile ID
   - **IM**: Instant messaging verification
   - **SIM**: SIM card verification

For the IP flow's redirects, callback, code exchange, and result/session behavior, see [PNV via IP](PNV.md).

### Quick Access Login

1. Go to **Login** tab
2. Click desired login method:
   - **IP**: Carrier-based login
   - **IP+**: Enhanced login
   - **IM**: Instant messaging login
   - **SIM**: SIM card login

### Identity Services

1. Go to **Identity** tab
2. For **Anonymous Identity**: Click button directly
3. For **KYC Data**: Enter phone number, then click "KYC"

---

## Common Issues

### Port Already in Use

**Error**: `Port 3000 is already in use`

**Solution**:

```bash
PORT=3001 npm start
```

Then access: `http://<your-ip>:3001`

### Configuration Error

**Error**: `Configuration error: auth_servers must be defined as an array in config`

**Solution**:

- Ensure `auth_servers` array is defined in `config/default.json`
- Must contain at least one server with `id` and `url` fields
- See [Sample Config Reference](CONFIG_DEFAULT_JSON_SAMPLE.md) for proper format

**Error**: `Client not found`

**Solution**:

- Verify `config/default.json` exists
- Check that `user_flow` matches configuration
- Ensure client credentials are correct
- Reference [Sample Config Reference](CONFIG_DEFAULT_JSON_SAMPLE.md) for required fields

### Cannot Access from Mobile Device

**Issue**: Mobile device cannot reach the application

**Solutions**:

1. Ensure desktop and mobile are on same network
2. Check firewall settings
3. Use machine's local IP (not `localhost` or `127.0.0.1`)
4. Verify port is not blocked

### Authentication Fails

**Issue**: Authentication redirects to error page

**Solutions**:

1. Verify `redirect_uri` in IPification dashboard matches:

   ```
   http://localhost:3000/auth/callback/<user_flow>/<server_id>
   ```

   Example: `http://localhost:3000/auth/callback/pvn_ip/stage`

2. Check client_id and client_secret are correct
3. Verify scope permissions match client configuration
4. Ensure phone number format is E.164 (e.g., `+1234567890`)
5. Confirm the selected auth server is accessible and properly configured

---

## Development Mode

For development with auto-reload:

```bash
npm run dev
```

This uses `nodemon` to automatically restart the server when files change.

## Environment Variables

Create a `.env` file for custom configuration:

```bash
PORT=3000
NODE_ENV=development
```

Supported `NODE_ENV` values: `development`, `stage`, `production`.

---

## Next Steps

- Read [README.md](../README.md) for detailed documentation
- Check [API.md](API.md) for API endpoint details
- Review [ARCHITECTURE.md](ARCHITECTURE.md) for system design
- Explore different user flows in the application

---

## Getting Help

- **IPification Developer Portal**: https://developer.ipification.com/
- **IPification Website**: https://www.ipification.com/
- Check application logs for detailed error messages
