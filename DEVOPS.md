# ASTERRA DevOps

How ASTERRA is hosted, deployed and checked. For app code, see `frontend/README.md` and `backend/README.md`.

## At a glance

| What | Where |
|---|---|
| Website | https://asterra.ink (`www.asterra.ink` redirects here) |
| API | https://api.asterra.ink, health check: https://api.asterra.ink/api/v1/health, docs: https://api.asterra.ink/docs |
| Server | Hetzner Cloud project `asterra-hackathon`, server `asterra-hackathon` (CPX22: 2 vCPU, 4 GB RAM, 80 GB disk), Helsinki, IP `46.62.241.6` |
| Domain and DNS | Namecheap, `asterra.ink`, nameservers: Namecheap BasicDNS |
| Code | this repo; the server has it at `/opt/asterra` |
| CI | GitHub Actions `ci` on every pull request and every push to `main` |
| CD | GitHub Actions `deploy` on every push to `main` |

```
                   Namecheap DNS: asterra.ink, www, api  →  46.62.241.6
                                         │
Browser ──HTTPS──▶  Hetzner server ┌─────┴──────────────────────────────────────┐
                                   │ caddy  (ports 80/443, Let's Encrypt)        │
                                   │   asterra.ink      → web:3000  (Next.js)    │
                                   │   www.asterra.ink  → redirect to asterra.ink│
                                   │   api.asterra.ink  → api:8000  (FastAPI)    │
                                   └─────────────────────────────────────────────┘
                                         web, api ──▶ NASA POWER, NASA GIBS, …
```

## How a change goes live

1. Open a pull request. **ci** runs: backend lint + tests, frontend lint + typecheck + tests + build, compose check.
2. **Don't merge a PR with a red ❌.** (On a private repo on the free plan, GitHub can't block it for us.)
3. Merge into `main`. **deploy** starts by itself:
   - connects to the server with the `DEPLOY_SSH_KEY` secret
   - the server runs `/usr/local/bin/asterra-deploy`: `git pull`, then `docker compose up -d --build`, then cleans up old images
   - checks that `https://asterra.ink` and the API health answer
4. About 1–3 minutes later the change is live. The site can show a 502 error for a few seconds while containers restart.

Deploy again by hand: **Actions → deploy → Run workflow**.

## Files in this repo

| File | Purpose |
|---|---|
| `docker-compose.yml` | the three containers `web`, `api`, `caddy` and their volumes |
| `Caddyfile` | domains, HTTPS, and which container each domain goes to |
| `frontend/Dockerfile` | builds and runs Next.js (`scripts/` is copied before `npm ci` because `postinstall` needs it) |
| `backend/Dockerfile` | builds and runs FastAPI with uv |
| `.github/workflows/ci.yml` | checks for pull requests |
| `.github/workflows/deploy.yml` | auto-deploy; the server's SSH host key is pinned in it |

## On the server

Log in from your Mac:
```bash
ssh -i ~/.ssh/nishast_hetzner root@46.62.241.6
```
The prompt `root@asterra-hackathon` means you are on the server. Always `cd /opt/asterra` first.

| Task | Command |
|---|---|
| What is running | `docker compose ps` |
| Logs (web / api / caddy) | `docker compose logs --tail 50 api` |
| Follow logs live | `docker compose logs -f api` (Ctrl+C to stop) |
| Restart one part | `docker compose restart api` |
| Deploy by hand | `asterra-deploy` |
| Memory and disk | `free -h` and `df -h /` |
| Container CPU and memory | `docker stats --no-stream` |

### What lives where on the server

| Path | What |
|---|---|
| `/opt/asterra` | the repo (read-only deploy key `~/.ssh/github_asterra`, set in `git config core.sshCommand`) |
| `/opt/asterra/backend/.env` | backend settings and secrets; **not in git**, `chmod 600` |
| `/usr/local/bin/asterra-deploy` | the deploy script that GitHub Actions runs |
| `~/.ssh/authorized_keys` | your Mac key, plus the GitHub Actions key, limited with `command="/usr/local/bin/asterra-deploy",restrict` |
| Docker volume `asterra_nasa_cache` | backend cache of NASA answers (`/data/cache` in the container) |
| Docker volume `asterra_caddy_data` | HTTPS certificates (deleting it forces new certificates) |

### Backend settings (`backend/.env`)

All names start with `ASTERRA_` (see `backend/.env.example`). On the server:
```
ASTERRA_ENVIRONMENT=prod
ASTERRA_CORS_ORIGINS=["https://asterra.ink","https://www.asterra.ink"]
```
After changing it: `docker compose up -d api`.

## Secrets

| Secret | Where | Note |
|---|---|---|
| `DEPLOY_SSH_KEY` | GitHub → Settings → Secrets and variables → Actions | private key for deploys, stored as one line of base64; it can only run the deploy script |
| `backend/.env` | server only | never commit it |
| Deploy key `asterra-hackathon` | GitHub → Settings → Deploy keys | read-only; lets the server `git pull` |

### Replace the deploy key (if it leaks or deploys say "Permission denied")
On the server:
```bash
sed -i '/github-actions-deploy/d' ~/.ssh/authorized_keys && rm -f ~/.ssh/gh_actions ~/.ssh/gh_actions.pub
ssh-keygen -t ed25519 -f ~/.ssh/gh_actions -N "" -C github-actions-deploy
echo "command=\"/usr/local/bin/asterra-deploy\",restrict $(cat ~/.ssh/gh_actions.pub)" >> ~/.ssh/authorized_keys
base64 -w0 ~/.ssh/gh_actions; echo
```
Paste that one line into the `DEPLOY_SSH_KEY` secret, then delete the key on the server: `rm ~/.ssh/gh_actions`.

## DNS (Namecheap → Advanced DNS)

| Type | Host | Value |
|---|---|---|
| A | `@` | `46.62.241.6` |
| A | `www` | `46.62.241.6` |
| A | `api` | `46.62.241.6` |

Check from a Mac: `dig +short asterra.ink www.asterra.ink api.asterra.ink`

## Security

- Hetzner Cloud firewall `asterra-fw`: inbound only TCP 22, 80, 443 and ICMP. Don't use `ufw` on the server, because Docker bypasses it.
- SSH: key login only; password login is turned off in `/etc/ssh/sshd_config.d/99-keys-only.conf`.
- Automatic Ubuntu security updates (`unattended-upgrades`).
- Only Caddy is reachable from outside; `web` and `api` are only on the internal Docker network.
- Bots scanning for WordPress and similar show up in the Caddy logs; that's normal for any public server.

## When something is wrong

| Symptom | Look at | Usual cause / fix |
|---|---|---|
| Site shows 502 | `docker compose ps`, `docker compose logs --tail 50 web` | a container is restarting or crashed; wait 10 s, or `docker compose up -d` |
| deploy run is red at "Deploy over SSH" | the Actions log | `Permission denied` / `error in libcrypto`: replace the deploy key (above) |
| deploy run is red at "git pull" | the Actions log | someone edited files on the server; `cd /opt/asterra && git status` and undo local changes |
| deploy run is red at "Check the site answers" | `docker compose logs --tail 80 api` / `web` | the new code starts but crashes; fix it and merge again |
| Browser says "CORS policy" | `backend/.env` | add the site's address to `ASTERRA_CORS_ORIGINS`, then `docker compose up -d api` |
| HTTPS error | `docker compose logs caddy \| grep -i certificate` | DNS doesn't point to the server, or ports 80/443 are blocked |
| Server slow or out of memory | `free -h`, `docker stats --no-stream` | 2 GB swap exists; a big rebuild can be slow for a minute |
| Disk full | `df -h /` | `docker system prune -f` removes stopped containers and unused images (never use `-a --volumes`: that deletes the cache and certificates) |

## Set up a new server from scratch

1. Hetzner: Ubuntu 24.04, CPX22, your SSH key, firewall 22/80/443/ICMP.
2. Namecheap: point `@`, `www`, `api` to the new IP.
3. On the server:
   ```bash
   apt update && apt upgrade -y
   timedatectl set-timezone Asia/Dushanbe
   apt install -y unattended-upgrades docker.io docker-compose-v2 docker-buildx git
   fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
   echo -e "PasswordAuthentication no\nKbdInteractiveAuthentication no" > /etc/ssh/sshd_config.d/99-keys-only.conf && systemctl reload ssh
   ssh-keygen -t ed25519 -f ~/.ssh/github_asterra -N "" -C asterra-hackathon   # add the .pub as a read-only Deploy key on GitHub
   GIT_SSH_COMMAND="ssh -i ~/.ssh/github_asterra -o StrictHostKeyChecking=accept-new" git clone git@github.com:sudoba222/asterra-ink.git /opt/asterra
   cd /opt/asterra && git config core.sshCommand "ssh -i ~/.ssh/github_asterra"
   cp backend/.env.example backend/.env && chmod 600 backend/.env   # then set ENVIRONMENT and CORS as above
   docker compose up -d --build
   ```
4. Create `/usr/local/bin/asterra-deploy` (`git pull --ff-only` + `docker compose up -d --build --remove-orphans` + `docker image prune -f`, with `flock`) and the GitHub Actions key (see "Replace the deploy key").
5. A new server has a new SSH host key: update the pinned line in `.github/workflows/deploy.yml` with `ssh-keyscan -t ed25519 <new IP>`.

## Demo day checklist

- [ ] No merges to `main` in the last 2 hours before judging (each merge restarts the site).
- [ ] The evening before, open each demo field once so NASA answers are cached and the demo is fast.
- [ ] Optional: set `ASTERRA_CACHE_TTL_SECONDS=604800` (7 days) in `backend/.env`, then `docker compose up -d api`, so the warmed cache doesn't expire during judging.
- [ ] `docker compose ps`: all three containers are `Up`.
- [ ] Open https://asterra.ink and https://api.asterra.ink/api/v1/health 10 minutes before your slot.
- [ ] Have the backup demo video ready.

## After the hackathon

Judges can look at the project for weeks after the event, so keep the server running until the results are out (about $0.03 per hour). Then:
1. Hetzner: delete the project `asterra-hackathon` (server, firewall and key go with it).
2. Namecheap: delete or change the three A records.
3. GitHub: delete the `DEPLOY_SSH_KEY` secret and the deploy key `asterra-hackathon`.
