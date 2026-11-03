# 10bis Automation System

An automated system for managing 10bis credit loading and token refresh operations. Choose from three deployment options: **GitHub Actions** (cloud-based, no server required), **Linux Server** (traditional cron-based), or **Docker** (containerized testing).

## Features

- **Automatic Token Refresh**: Refreshes authentication tokens before loading credit; standalone refresh is manual
- **Scheduled Credit Loading**: Primary and fallback runs Sunday-Thursday, with a daily payment-attempt guard
- **Microsoft Teams Notifications**: Real-time notifications for success/failure with amount and timestamp
- **Robust Error Handling**: Comprehensive logging and retry mechanisms
- **Secure Token Management**: Automatic token updates and encrypted storage
- **Weekend Detection**: Automatically skips credit loading on Friday and Saturday
- **Multiple Deployment Options**: GitHub Actions, Linux Server, or Docker
- **Zero Maintenance**: GitHub Actions option requires no server maintenance

## Deployment

### 🚀 GitHub Actions (Cloud-based)

**This system is designed for GitHub Actions deployment**

✅ **Advantages:**
- No server required - runs in GitHub's cloud
- Automatic token updates stored securely in GitHub secrets
- Built-in logging and monitoring
- Free for most usage (2,000 minutes/month)
- Zero maintenance and security updates
- Microsoft Teams notifications

❌ **Requirements:**
- GitHub repository (free)
- GitHub Personal Access Token

📖 **Setup Guide**: [`GITHUB-ACTIONS-SETUP.md`](GITHUB-ACTIONS-SETUP.md)

### Scheduling reliability and payment safety

Comparison repositories: `10bisAuto` remains the unchanged original.
`10bisAuto-keep-alive` preserves original payment code with only Keep Alive repaired.
`10bisAuto-upstream-latest` explicitly snapshots upstream commit `d503933`
(2026-03-04), which already includes the 2025-11-02 loading fix and matches the
original payment code. Those variants retain 07:05 UTC Sunday-Thursday loading.
Only this `10bisAuto-fixed` variant has the daily attempt guard and frequent window
below. Guards do not coordinate across repositories: all four may charge the
same account. Shared authentication refreshes may interfere. Check each repository's
Actions > Load Credit steps and actual balance; Keep Alive success is not payment evidence.

- [Load Credit](.github/workflows/load-credit.yml) requests an automatic run every
  five minutes, Sunday-Thursday, across 06:00-15:55 UTC to cover both Israel UTC
  offsets. Both the history guard and payment script enforce **09:00 inclusive
  to 18:00 exclusive in Asia/Jerusalem**, including DST and weekend checks.
  Extra UTC opportunities outside that local window skip without refreshing tokens
  or loading money. This replaces the one-day test schedule.
  GitHub may delay or drop runs; more opportunities do not guarantee execution.
  No new payment request starts at or after 18:00, but a request already sent may
  complete later. Runner usage increases; disable the separate diagnostic once
  scheduling evidence has been collected.
- The workflows remain serialized with token refresh. Before loading, the guard
  checks prior payment steps (including reruns), using the Israel calendar date.
  A successful payment blocks another load even if a later log-upload step failed.
  If a payment failed, was cancelled, or its result is uncertain, automation stops
  rather than risk a second charge. Verify your actual balance before loading manually.
- Failures **before** the payment step may be retried by a fallback run. Payment
  requests themselves are never retried automatically: a timeout does not prove
  that a payment was rejected. Unreadable run history also prevents payment.
- If you load manually outside GitHub, set the repository **Actions variable**
  `CREDIT_SKIP_DATES` to the Israel date (`YYYY-MM-DD`; comma-separated for multiple
  dates) **before** loading. The guard cannot see payments made on the website.
  The rollout date `2026-11-02` is excluded because credit was already loaded manually.
- Keep run history for at least seven days; deleting payment runs can defeat the
  duplicate-attempt guard. Do not remove or rename the payment step without updating
  the guard and tests. The guard is conservative, not a payment-provider idempotency key.
- [Keep Alive](.github/workflows/keep-alive.yml) is now a single monthly workflow,
  with explicit `contents: write` permission and a manual trigger. It pushes an
  actual empty commit; merely printing a message does not create repository activity.
  Repository/organization policies or branch protection may still reject bot writes;
  inspect any 403 failure rather than assuming the workflow kept scheduling active.
- Confirm Actions are enabled and these workflows are **active** on the default
  branch. A disabled workflow cannot wake itself up.
- Temporary [Schedule Diagnostic (No Payment)](.github/workflows/schedule-diagnostic.yml)
  runs at minutes 08, 23, 38 and 53 of every hour (UTC). It only records the event,
  cron expression and actual runner time in the job log and summary, with no
  checkout, credentials or payment requests. Only an automatically created
  `schedule` run demonstrates schedule delivery; publication or passing offline
  tests does not. This does not change or trigger Load Credit. Disable this
  diagnostic in Actions after collecting evidence to avoid ongoing runner usage.

Run `npm test` for offline regression tests; these never contact 10bis, refresh real
tokens, send Teams notifications, or load credit. The older `test.js` targets server
files that are not present in this GitHub-Actions repository.

## Quick Start

### GitHub Actions Setup

```bash
# 1. Push your code to GitHub
git init
git add .
git commit -m "Initial commit"
git push origin main

# 2. Set up GitHub secrets (see GITHUB-ACTIONS-SETUP.md)
# 3. Update tokens when needed:
npm run update-github-secrets

# 4. The automation starts running automatically!
```

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url> 10bis-automation
cd 10bis-automation
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set up GitHub Repository Secrets

Follow the [`GITHUB-ACTIONS-SETUP.md`](GITHUB-ACTIONS-SETUP.md) guide to configure:
- `ACCESS_TOKEN`
- `REFRESH_TOKEN`
- `AMOUNT`
- `MONEYCARD_ID`
- `TEAMS_WEBHOOK_URL` (optional)
- `PERSONAL_ACCESS_TOKEN`

### 4. Update Tokens When Needed

```bash
# Update GitHub repository secrets with fresh tokens
npm run update-github-secrets

# Test Teams notifications
npm run test-teams-connection
```

📖 **Teams Setup Guide**: [`TEAMS-SETUP.md`](TEAMS-SETUP.md)

## Cron Job Setup

### 1. Find Node.js Path

```bash
which node
# Example output: /usr/bin/node
```

### 2. Get Project Path

```bash
pwd
# Example output: /home/user/10bis-automation
```

### 3. Edit Crontab

```bash
crontab -e
```

### 4. Add Cron Jobs

Copy the following lines to your crontab, replacing the paths with your actual paths:

```bash
# Token Refresh - Every 10 minutes
*/10 * * * * /usr/bin/node /home/user/10bis-automation/refresh-token.js >> /home/user/10bis-automation/logs/cron.log 2>&1

# Credit Loading - Daily at 10 AM (excluding Friday and Saturday)
0 10 * * 0,1,2,3,4 /usr/bin/node /home/user/10bis-automation/load-credit.js >> /home/user/10bis-automation/logs/cron.log 2>&1
```

### 5. Verify Cron Jobs

```bash
crontab -l
```

## File Structure

```
10bis-automation/
├── package.json                        # Node.js project configuration
├── config.json                         # Authentication tokens and settings (local dev)
├── README.md                           # Main documentation
├── GITHUB-ACTIONS-SETUP.md             # GitHub Actions deployment guide
├── DEPLOYMENT.md                       # Linux server deployment guide
├── DOCKER-TESTING.md                   # Docker testing guide
├── TEAMS-SETUP.md                      # Microsoft Teams notifications setup guide
├── TOKEN-TROUBLESHOOTING.md            # Token refresh troubleshooting guide
├── .github/
│   └── workflows/
│       └── 10bis-automation.yml        # GitHub Actions workflow
├── github-actions-utils.js             # GitHub Actions compatible utilities
├── github-refresh-token.js             # Token refresh for GitHub Actions
├── github-load-credit.js               # Credit loading for GitHub Actions
├── utils.js                            # Utility functions (server deployment)
├── refresh-token.js                    # Token refresh script (server deployment)
├── load-credit.js                      # Credit loading script (server deployment)
├── teams-notifier.js                   # Teams notification utility (server deployment)
├── github-teams-notifier.js            # Teams notification utility (GitHub Actions)
├── test.js                             # Comprehensive test suite
├── test-teams-notifications.js         # Teams notification testing script
├── debug-token-refresh.js              # Token refresh debugging utility
├── update-tokens.js                    # Token update utility for local config
├── update-github-secrets.js            # GitHub repository secrets update utility
├── deploy.sh                           # Automated deployment script for Linux
├── crontab-setup.txt                   # Cron job configuration examples
├── Dockerfile                          # Docker container configuration
├── docker-compose.yml                  # Docker Compose configuration
├── .dockerignore                       # Docker build optimization
└── logs/                               # Log files directory (created automatically)
    ├── refresh.log                     # Token refresh logs
    ├── credit.log                      # Credit loading logs
    ├── error.log                       # Error logs
    ├── test.log                        # Test execution logs
    ├── teams-test.log                  # Teams notification test logs
    ├── debug-token-refresh.log         # Token refresh debug logs
    ├── token-update.log                # Token update logs
    ├── github-secrets-update.log       # GitHub secrets update logs
    └── cron.log                        # Cron job execution logs
```

## Monitoring and Logs

### Log Files

- **refresh.log**: Token refresh operations
- **credit.log**: Credit loading operations
- **error.log**: All error messages
- **cron.log**: Cron job execution output

### View Recent Logs

```bash
# View last 50 lines of refresh logs
tail -n 50 logs/refresh.log

# View last 50 lines of credit logs
tail -n 50 logs/credit.log

# View error logs
tail -n 50 logs/error.log

# Monitor logs in real-time
tail -f logs/refresh.log
```

### Check Cron Job Status

```bash
# Check if cron service is running
systemctl status cron

# View cron logs (Ubuntu/Debian)
grep CRON /var/log/syslog

# View cron logs (CentOS/RHEL)
grep CRON /var/log/messages
```

## Troubleshooting

### Common Issues

1. **Scripts not running via cron**
   - Check file permissions: `ls -la *.js`
   - Verify Node.js path: `which node`
   - Check cron service: `systemctl status cron`

2. **Authentication errors (HTTP 401)**
   - **Quick fix for local**: Update tokens manually: `npm run update-tokens`
   - **Quick fix for GitHub Actions**: Update repository secrets: `npm run update-github-secrets`
   - Check current token status: `npm run token-status`
   - Run detailed debug: `npm run debug-tokens`
   - See [`TOKEN-TROUBLESHOOTING.md`](TOKEN-TROUBLESHOOTING.md) for detailed solutions
   - Verify tokens in `config.json` are current
   - Check if manual token refresh works: `npm run refresh-token`

3. **Missing dependencies**
   - Run `npm install` in the project directory
   - Check Node.js version: `node --version`

4. **Permission denied errors**
   - Set proper permissions: `chmod +x *.js`
   - Secure config file: `chmod 600 config.json`

### Manual Testing

```bash
# Test token refresh manually
node refresh-token.js

# Test credit loading configuration
node load-credit.js --test

# Test credit loading (respects weekend check)
node load-credit.js

# Test Teams notifications
npm run test-teams-connection

# Test Teams notifications with full messages
npm run test-teams

# View Teams setup instructions
npm run teams-setup

# Debug token refresh issues
npm run debug-tokens

# Check current token status
npm run token-status

# Update tokens manually for local development
npm run update-tokens

# Update GitHub repository secrets for GitHub Actions
npm run update-github-secrets

# Get help for GitHub Personal Access Token setup
npm run github-token-help
```

### Debug Mode

Add debug logging by modifying the log level in `utils.js` or check the detailed logs in the `logs/` directory.

## Security Considerations

- Keep `config.json` secure with restricted permissions (600)
- Regularly rotate authentication tokens
- Monitor log files for suspicious activity
- Consider using environment variables for sensitive data in production

## API Endpoints

The system interacts with these 10bis API endpoints:

- **Token Refresh**: `POST https://api.10bis.co.il/api/v1/Authentication/RefreshToken`
- **Credit Loading**: `PATCH https://api.10bis.co.il/api/v1/Payments/LoadTenbisCredit`

## Schedule Details

- **Token Refresh**: Immediately before loading; standalone refresh is manual
- **Credit Loading**: Every five minutes Sunday-Thursday, gated to 09:00-18:00 Israel time and one daily payment attempt
- **Weekend Skip**: Automatically skips Friday and Saturday

## Support

For issues or questions:
1. Check the log files in the `logs/` directory
2. Verify your configuration in `config.json`
3. Test scripts manually before troubleshooting cron issues
4. Ensure all dependencies are installed with `npm install`