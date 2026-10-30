# Security policy

JACOBRAKAI FOUNDATION (Jacobrakai) welcomes good-faith reports of security issues in Beanstalk.

## Supported versions

Only the latest release and the `main` branch are supported for security fixes.

## Reporting a vulnerability

Email **security@jacobrakai.org**.

If GitHub private vulnerability reporting is enabled on this repository, you may also use the **Security** tab (Report a vulnerability).

Include:

- What you tested and where (app, site, or repository path)
- Steps to reproduce
- Impact if an attacker exploited it
- Any proof-of-concept or logs that help confirm the issue

A short report with a reliable reproduction is more useful than a scanner dump.

We aim to acknowledge reports within **7 days**. If assessment will take longer, we will say so.

## Coordinated disclosure

Please do not disclose the issue publicly until a fix is available or we have agreed a disclosure window. Absent agreement, we expect public disclosure ninety days after the report or when a fix ships, whichever comes first. We will credit you by the name you choose, or not at all if you prefer.

## Safe harbor

Research conducted in accordance with this policy is authorized by JACOBRAKAI FOUNDATION, and the Foundation will not initiate legal action against you for it. This authorization covers only the hosts and paths listed under Scope.

Research is in accordance with this policy only if you stay within Scope; access, modify, or retain no more data than needed to demonstrate the issue; stop and report promptly on encountering anyone else's data, without keeping copies; avoid degrading the service; and follow the disclosure timeline above.

This statement binds the Foundation only. It cannot authorize access to systems operated by anyone else, including third-party services we depend on, and it does not displace any law that applies to you.

## Scope

In scope:

- The Beanstalk application (web, native clients, and notification service in this repository)
- The site at https://jacobrakaifoundation.github.io/beanstalk/
- `https://api.jacobrakai.org`, paths `/v1/*` and `/healthz` only. Other paths and other jacobrakai.org hosts are out of scope.
- Source code in this repository

Out of scope:

- Third-party services and data sources (for example FDA openFDA and USDA FSIS APIs and feeds)
- GitHub and hosting infrastructure we do not operate
- Social engineering of staff, volunteers, or contributors
- Denial of service, volumetric testing, and automated load generation
- Findings from automated scanners without a demonstrated impact
- Missing best-practice headers, cookie flags, or TLS preferences without a demonstrated exploit
