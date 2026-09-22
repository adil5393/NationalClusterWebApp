FROM node:20-alpine

WORKDIR /app

# Trusts this machine's antivirus/proxy TLS-interception root cert, if the
# dev machine building this image exported one locally (see .gitignore's
# *-root-ca.crt — never committed, so this is a per-machine, opt-in step;
# absent everywhere else, these three lines are a no-op). node:20-alpine
# ships no ca-certificates package at all, so bootstrapping it explicitly
# over plain HTTP (apk verifies package signatures independently of
# transport TLS, so this is still safe/integrity-checked) sidesteps the
# chicken-and-egg of needing a trusted cert to install the thing that
# manages trusted certs. "Dockerfile" is always present, so pairing it in
# the same COPY means this never fails the build when no cert exists here.
RUN apk add --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/latest-stable/main ca-certificates
COPY *-root-ca.crt Dockerfile /tmp/maybe-ca/
RUN mv /tmp/maybe-ca/*.crt /usr/local/share/ca-certificates/ 2>/dev/null; rm -rf /tmp/maybe-ca; update-ca-certificates
# Node bundles its own CA list instead of using the system store
# update-ca-certificates just updated — NODE_EXTRA_CA_CERTS repoints it at
# that system bundle (added on TOP of Node's own list, not replacing it),
# which always exists and is valid whether or not a cert was added above,
# so this is a safe no-op on every machine that didn't need one.
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile || yarn install

COPY . .

EXPOSE 5173

CMD ["yarn", "start"]
