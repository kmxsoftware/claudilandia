# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Claudilandia, please report it responsibly.

### How to Report

**Email:** [karol.mroszczyk@gmail.com](mailto:karol.mroszczyk@gmail.com)

**Subject:** `[SECURITY] Claudilandia - Brief description`

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 7 days
- **Resolution timeline:** Depends on severity, typically 30-90 days

### What to Expect

1. We will acknowledge receipt of your report
2. We will investigate and assess the vulnerability
3. We will work on a fix and coordinate disclosure
4. We will credit you in the release notes (unless you prefer anonymity)

### Responsible Disclosure

Please:
- Give us reasonable time to fix the issue before public disclosure
- Do not exploit the vulnerability beyond what is necessary to demonstrate it
- Do not access or modify other users' data

## Security Measures

Claudilandia implements several security measures:

### Authentication
- Token-based authentication for remote access
- Configurable token expiry
- Permanent approved devices with unique tokens

### Rate Limiting
- 50 failed authentication attempts trigger lockout
- 1-minute lockout duration
- Per-IP tracking

### Data Protection
- Sensitive data redaction in logs (passwords, tokens, API keys, etc.)
- No hardcoded secrets in codebase
- Local-only data storage (no cloud sync)

### Network Security
- CORS whitelist for WebSocket connections
- Constant-time token comparison (timing attack prevention)
- Security headers on HTTP responses (X-Content-Type-Options, X-Frame-Options, etc.)

### Input Validation
- Terminal resize dimension limits
- Message length truncation
- Data sanitization

## Known Limitations

- Remote access runs without TLS by default (use ngrok for encrypted tunnels)
- Application stores state locally without encryption
- This is a local development tool, not designed for multi-user production environments
