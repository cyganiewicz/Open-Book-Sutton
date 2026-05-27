# IT Onboarding Guide

This guide is for municipal IT staff responsible for deploying and maintaining OpenBook for their town. It covers hosting, DNS, security, user management, and ongoing maintenance.

## What OpenBook Does

OpenBook is a web application that publishes your town's budget data (expenses, revenues, capital projects) in a resident-friendly portal. Town administrators upload budget spreadsheets through an admin dashboard, and residents view the data through charts, tables, and searchable line items on a public site.

## System Overview

- **Application**: Node.js web app (Next.js framework)
- **Database**: SQLite (single file, no separate database server)
- **Authentication**: Password-based with HTTP-only session cookies
- **Data**: All budget data is uploaded via CSV/Excel through the admin UI

No external database server is required. The entire application and its data live in a single deployment.

## Hosting Options

### Option A: Vercel (recommended)

Vercel is the simplest path. Your town gets a working URL in minutes with no server management.

**Steps:**

1. Create a free account at [vercel.com](https://vercel.com)
2. Fork or clone the OpenBook repository to your town's GitHub account
3. In Vercel, click **Add New Project** and import the GitHub repository
4. Set environment variables (see [Environment Variables](#environment-variables) below)
5. Click **Deploy**

Vercel gives you a URL like `openbook-abc123.vercel.app`. You can connect a custom domain later (see [Custom Domain Setup](#custom-domain-setup)).

**Cost**: Free tier covers typical municipal usage. No credit card required to start.

### Option B: Self-hosted server

If your town manages its own infrastructure, OpenBook runs on any server with Node.js 20+.

```bash
# Clone the repository
git clone <your-fork-url>
cd openbook

# Install dependencies
npm install

# Set environment variables
cp .env .env.local
# Edit .env.local with your values (see Environment Variables below)

# Build for production
npm run build

# Start the server
npm start
```

The application runs on port 3000 by default. Place it behind a reverse proxy (nginx, Apache, Caddy) to handle SSL and serve on port 443.

**Requirements:**
- Node.js 20 LTS or later
- 512 MB RAM minimum
- SSL certificate (Let's Encrypt works fine)

## Environment Variables

Set these before deploying:

| Variable       | Required | Description                                                    |
| -------------- | -------- | -------------------------------------------------------------- |
| `DATABASE_URL` | No       | SQLite file path. Defaults to `file:./dev.db`                  |

## Custom Domain Setup

Most towns will want OpenBook on their own domain, such as `budget.townname.gov` or `openbook.townname.gov`.

### For Vercel-hosted deployments

1. In Vercel project settings, go to **Domains**
2. Add your domain (e.g., `budget.townname.gov`)
3. Vercel shows the DNS record to create — typically a CNAME pointing to `cname.vercel-dns.com`
4. Create that record in your DNS provider
5. SSL is automatic (Vercel provisions a certificate)

### For self-hosted deployments

1. Create a DNS A record pointing your subdomain to your server's IP
2. Configure your reverse proxy to serve the application on that domain
3. Set up SSL (Let's Encrypt with certbot is the standard free option)

### If your town uses CivicPlus or Revize

You'll need to request the subdomain from your website vendor. Ask them to create a CNAME record pointing to your hosting provider.

### Wildcard SSL

If your town already has a wildcard certificate for `*.townname.gov`, any subdomain you create is automatically covered.

## User Management

OpenBook has two types of users:

### Admin users

Admins manage the portal — they upload budget data, configure branding, manage staff, and review capital requests.

**Creating the first admin:**
1. Navigate to `/admin/register`
2. Enter your name, email, and password
3. The first registered admin can then manage everything

### Staff users

Staff members submit capital expenditure requests. They cannot access the admin dashboard.

**How staff accounts work:**
1. An admin goes to the **Users** tab in the admin dashboard
2. Admin enters a staff member's email and clicks **Create Invite**
3. The system generates a unique invite link, which is automatically copied to the admin's clipboard
4. Admin sends the link to the staff member (via email, text, in person)
5. Staff member clicks the link, fills in their name, password, and department, and their account is created

Invite links are single-use. Once used, they cannot be reused by anyone else. Without a valid invite link, nobody can register as staff.

### Email domain restrictions

Admins can restrict which email domains are allowed for staff invites. In the **Users** tab, click **Edit** under "Allowed Email Domains" and enter your town's domains (e.g., `townname.gov, town.sutton.ma.us`). Only emails matching those domains can be invited.

If no domains are configured, any email address can be invited.

### Password resets

If a staff member forgets their password, an admin can generate a password reset link from the **Users** tab. Click **Reset Password** next to the user — a one-time link is copied to the clipboard. Send it to the staff member, and they can set a new password. The link expires after use.

## Security Considerations

OpenBook publishes public budget data. The security posture should match that context:

- **Passwords** are hashed with scrypt (not stored in plaintext)
- **Sessions** are HTTP-only cookies with 7-day expiration
- **Admin registration** is open for the first account, then locked to existing admins
- **Staff registration** requires an invite token from an existing admin
- **Data risk** is low — this is public financial data. The main concern is preventing unauthorized modification that could make the town look bad, not protecting secrets

### Recommendations

- Restrict staff email domains to your town's `.gov` domain
- Run behind HTTPS (automatic on Vercel; use Let's Encrypt for self-hosted)
- Keep Node.js updated for security patches

## Data Management

### Budget data

All budget data is uploaded through the admin dashboard as CSV or Excel files. There is no direct database access needed. Admins can:

- Upload data by category (expenses, revenues, capital projects, reserves)
- Delete individual uploads or wipe all data
- Export/import town configuration via the Transfer tab

### Database backups

The database is a single SQLite file. For self-hosted deployments:

```bash
# Back up the database (safe while the app is running)
sqlite3 dev.db ".backup backup-$(date +%Y%m%d).db"
```

On Vercel, the database is part of the deployment. For production use with persistent data, consider connecting an external database (SQLite on a volume, or a hosted database through the Vercel Marketplace).

### Moving between environments

Use the **Transfer** tab in the admin dashboard to export your town's configuration and data as a JSON file. This can be imported into another OpenBook instance.

## Maintenance

### Updating OpenBook

For Vercel deployments, push changes to your GitHub repository and Vercel redeploys automatically.

For self-hosted:

```bash
git pull
npm install
npm run build
npm start  # or restart your process manager
```

### Monitoring

OpenBook logs errors to the server console. On Vercel, check the **Logs** tab in your project dashboard. For self-hosted, use your standard log management (journald, PM2 logs, etc.).

## Support

If you run into issues during setup, check the troubleshooting section in the project [README](../README.md#troubleshooting).
