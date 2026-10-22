# Documentation Index

Welcome! Find what you need quickly.

## 🚀 Start Here

**New to the project?**  
→ [Quick Start Guide](QUICKSTART.md) - Be running in 5 minutes

**Want to understand the project?**  
→ [README.md](../README.md) - Complete overview

**Need to configure something?**  
→ [Configuration Guide](CONFIG_DEFAULT_JSON_SAMPLE.md) - All config fields explained

---

## 📚 Documentation by Goal

### I want to...

**...set up the project quickly**  
→ [Quick Start](QUICKSTART.md) - 5-minute setup

**...configure auth servers**  
→ [Config Guide - auth_servers](CONFIG_DEFAULT_JSON_SAMPLE.md#auth_servers-fields)

**...customize UI text**  
→ [Locale Guide](LOCALE.md) - Text labels and translations

**...understand authentication flows**  
→ [Architecture](ARCHITECTURE.md) - How authentication works

**...follow phone verification via IP end to end**

→ [PNV via IP](PNV.md) - Phone input, redirects, code exchange, userinfo, and current verification limitations

**...integrate with the API**  
→ [API Reference](API.md) - Endpoint documentation

**...use SIM verification (TS43)**  
→ [TS43 Guide](TS43.md) - SIM-based auth

**...use SMS OTP verification**  
→ [SMS Flow Guide](SMS.md) - SMS-based phone verification

**...customize app behavior**  
→ [App Config](APP_CONFIG_JSON.md) - UI and versioning settings

---

## 📖 All Documentation Files

### User Guides

- **[Quick Start](QUICKSTART.md)** - Fast setup with examples
- **[Configuration](CONFIG_DEFAULT_JSON_SAMPLE.md)** - All config fields
- **[Locale](LOCALE.md)** - Customize UI text

### Feature Guides

- **[PNV via IP](PNV.md)** - End-to-end IP verification flow with code references and examples
- **[TS43 SIM Verification](TS43.md)** - Use SIM-based auth
- **[SMS Verification Flow](SMS.md)** - Use SMS OTP for phone verification
- **[Multi-Server Setup](CONFIG_DEFAULT_JSON_SAMPLE.md#auth_servers-fields)** - Configure multiple auth servers

### Reference

- **[API](API.md)** - Endpoint reference
- **[Architecture](ARCHITECTURE.md)** - System overview
- **[App Config](APP_CONFIG_JSON.md)** - App settings

---

## Documentation Structure

```
docs/
├── INDEX.md           ← You are here
├── QUICKSTART.md      ← Start here for setup
├── CONFIG_DEFAULT_JSON_SAMPLE.md  ← Config reference
├── LOCALE.md          ← UI text customization
├── PNV.md             ← IP phone verification flow and code walkthrough
├── TS43.md            ← SIM verification guide
├── SMS.md             ← SMS OTP verification guide
├── API.md             ← API endpoint reference
├── ARCHITECTURE.md    ← System overview
└── APP_CONFIG_JSON.md ← App behavior settings
```

---

## Need Help?

### Common Questions

**Q: How do I start the app?**  
A: See [Quick Start](QUICKSTART.md)

**Q: How do I add another auth server?**  
A: Edit `auth_servers` array in config - [Guide](CONFIG_DEFAULT_JSON_SAMPLE.md#auth_servers-fields)

**Q: How do I change button labels?**  
A: Edit `locale` in config - [Guide](LOCALE.md)

**Q: How do I enable SIM verification?**  
A: Add `pvn_sim` to clients - [TS43 Guide](TS43.md)

**Q: How do I enable SMS OTP verification?**  
A: Add `pvn_sms` to clients - [SMS Flow Guide](SMS.md)

**Q: Where are the API endpoints?**  
A: See [API Documentation](API.md)

### Resources

- **IPification Developer Portal**: https://developer.ipification.com/
- **IPification Website**: https://www.ipification.com/

---

## File Descriptions

<details>
<summary>Click to see detailed description of each documentation file</summary>

### Quick Start Guide

**File**: `docs/QUICKSTART.md`

**Contents**:

- 5-minute setup instructions
- Prerequisites checklist
- Common issues and solutions
- Testing different flows

**Best for**: First-time users, quick setup

---

### Main README

**File**: `README.md` (root directory)

**Contents**:

- Project overview
- Features list
- Installation instructions
- Configuration guide
- User flows explanation
- API endpoints overview
- Docker deployment
- Development guide
- Troubleshooting

**Best for**: Complete reference, understanding the project

---

### API Documentation

**File**: `docs/API.md`

**Contents**:

- Detailed endpoint documentation
- Request/response formats
- Query parameters
- Status codes
- WebSocket events
- Error handling
- Code examples

**Best for**: API integration, endpoint reference

---

### Architecture Documentation

**File**: `docs/ARCHITECTURE.md`

**Contents**:

- System architecture diagrams
- Component structure
- Data flow diagrams
- Security architecture
- Module structure
- Performance considerations
- Extension points

**Best for**: Understanding system design, extending the application

---

### TS43 Route Documentation

**File**: `docs/TS43.md`

**Contents**:

- TS43 router responsibilities and flow
- Endpoint behavior and request/response fields
- Helper function roles
- Key code snippet for digital request output

**Best for**: Understanding TS43 flow and router behavior

---

### SMS Flow Documentation

**File**: `docs/SMS.md`

**Contents**:

- SMS OTP verification flow (CIBA with channel sms)
- Quick setup and configuration
- Frontend integration (login button, start_pvn_sms, start_sms_flow)
- API endpoints: `/sms/auth`, `/sms/token`, `/sms/log`
- Backend → auth server: CIBA auth, SMS callback, token exchange
- Troubleshooting

**Best for**: Implementing or debugging SMS phone verification

---

### Sample Config Reference

**File**: `docs/CONFIG_DEFAULT_JSON_SAMPLE.md`

**Contents**:

- How to copy and apply the sample config
- Required vs optional configuration fields
- Auth servers configuration (multi-server support)
- Client flow configuration with credential override mechanism
- Locale override fields
- Configuration examples and troubleshooting

**Best for**: Understanding and customizing `config/default.json.sample`

**Key Features**:

- Multi auth server support with dropdown selection
- Credential fallback mechanism (root vs per-client)
- Complete field validation on startup

---

### App Config Reference

**File**: `docs/APP_CONFIG_JSON.md`

**Contents**:

- App UI configuration schema
- Versioning and maintenance settings
- Branding, environment labels, and screen text
- Override examples via `config/default.json`

**Best for**: Customizing `config/app_config.json` and app UI behavior

---

### Locale Configuration

**File**: `docs/LOCALE.md`

**Contents**:

- Locale file structure
- Override mechanism
- Deep merging behavior
- Usage examples
- Troubleshooting guide

**Best for**: Customizing UI text labels, internationalization setup

## Documentation Conventions

### Code Examples

All code examples use:

- **bash** for shell commands
- **json** for configuration files
- **javascript** for code snippets

### Diagrams

Architecture diagrams use ASCII art format for universal compatibility.

### Links

- Internal links use relative paths
- External links open in new tabs (when applicable)

## Contributing to Documentation

When updating documentation:

1. Keep examples up-to-date with code changes
2. Update all affected documentation files
3. Test code examples before committing
4. Follow existing documentation style
5. Update this index if adding new documentation files

## Documentation Updates

**Last Updated**: [Current Date]

**Version**: 1.1.27-SNAPSHOT

**Maintainer**: Development Team

## Feedback

For documentation feedback or improvements:

- Create an issue in the repository
- Submit a pull request with improvements
- Contact the development team

</details>
