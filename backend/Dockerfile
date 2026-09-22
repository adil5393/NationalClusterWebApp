FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Trusts this machine's antivirus/proxy TLS-interception root cert, if the
# dev machine building this image exported one locally (see .gitignore's
# *-root-ca.crt — never committed, so this is a per-machine, opt-in step).
# "Dockerfile" is always present, so pairing it in the same COPY means this
# never fails the build even when no *-root-ca.crt exists here; the mv below
# then only moves a cert onward into place if one actually landed, and
# update-ca-certificates is always safe to run either way.
COPY *-root-ca.crt Dockerfile /tmp/maybe-ca/
RUN mv /tmp/maybe-ca/*.crt /usr/local/share/ca-certificates/ 2>/dev/null; rm -rf /tmp/maybe-ca; update-ca-certificates
# pip vendors its own CA bundle (certifi) instead of using the system store
# update-ca-certificates just updated — PIP_CERT repoints it at that system
# bundle, which always exists and is valid whether or not a cert was added
# above, so this is a safe no-op on every machine that didn't need one.
ENV PIP_CERT=/etc/ssl/certs/ca-certificates.crt

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
