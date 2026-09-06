# Security policy

## Reporting a vulnerability

Please do not disclose a suspected vulnerability in a public issue.

Use GitHub's **Security → Report a vulnerability** form for the Folio repository. Include the affected version, reproduction steps, impact and any suggested mitigation. If private vulnerability reporting is temporarily unavailable, contact the repository owner privately before sharing details publicly.

You should receive an acknowledgement within seven days. A fix and disclosure timeline will depend on severity and complexity.

## Supported versions

Security fixes are provided for the latest stable release only. Fixes are not backported to older releases or pre-release builds. Self-hosters should keep current and take a tested backup before updating.

## Deployment responsibility

Folio stores financially sensitive data. Use TLS, keep the application port behind a trusted reverse proxy, protect backups and generated secrets, and restrict host/database access. The default Compose binding is loopback-only for this reason.
