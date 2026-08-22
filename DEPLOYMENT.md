# Compute Engine deployment

This configuration deploys the application as three private Docker services on
one VM: PostgreSQL, FastAPI, and Nginx. Only Nginx publishes port 80. Nginx
serves the built React files and proxies `/api/*` to FastAPI, so the API and
database are not directly reachable from the internet.

## Assumptions

- Ubuntu 22.04 or 24.04 Compute Engine VM
- A reserved static external IP
- A DNS A record for your domain pointing to that IP (required before HTTPS)

## VM preparation

Connect with SSH, then install Docker from the official Docker repository or
the Ubuntu packages. With Ubuntu packages:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
exit
```

Reconnect after the final command, clone the repository, and prepare the
production environment:

```bash
git clone <YOUR-REPOSITORY-URL> national-cluster
cd national-cluster
cp .env.production.example .env.production
nano .env.production
```

Set a unique, long `POSTGRES_PASSWORD` and replace `your-domain.example` in
`CORS_ORIGINS` with the eventual HTTPS URL.

## Start and verify

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl http://127.0.0.1/health
```

In Google Cloud create firewall rules allowing TCP ports **80** and **443** to
this VM. Do not open 5432 or 8001. Confirm the site works over the VM's public
IP before pointing DNS to it.

## HTTPS

After DNS resolves to the VM, install Caddy on the host or add a TLS-enabled
Caddy reverse-proxy service. Caddy can automatically obtain and renew a Let's
Encrypt certificate. HTTP alone is not appropriate for an organizer/admin
portal.

## Updates and backups

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# Create a timestamped database backup on the VM.
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
```

Schedule encrypted backups to Cloud Storage before relying on the system for
event operations. The PostgreSQL Docker volume is only local VM storage.
