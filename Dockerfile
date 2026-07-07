FROM nginx:1.27-alpine

ARG VERSION=dev
ARG CF_ANALYTICS_TOKEN=""
ARG PLAUSIBLE_DOMAIN=""

COPY default.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY help.html /usr/share/nginx/html/help.html
RUN sed -i "s|DEPLOY_VERSION|${VERSION}|g" /usr/share/nginx/html/index.html
# Analytics beacons are opt-in build args. For each, substitute its placeholder
# when a value is given, otherwise strip the whole <!-- BEGIN X -->..<!-- END X -->
# block. Values are escaped so sed metacharacters (\ & |) can't corrupt the HTML
# or break the substitution.
RUN set -eu; \
    HTML='/usr/share/nginx/html/index.html /usr/share/nginx/html/help.html'; \
    esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/[&|]/\\&/g'; }; \
    apply() { \
      if [ -n "$3" ]; then \
        sed -i "s|$2|$(esc "$3")|g" $HTML; \
      else \
        sed -i "/<!-- BEGIN $1 -->/,/<!-- END $1 -->/d" $HTML; \
      fi; \
    }; \
    apply CF_ANALYTICS CF_ANALYTICS_TOKEN "${CF_ANALYTICS_TOKEN}"; \
    apply PLAUSIBLE PLAUSIBLE_DOMAIN "${PLAUSIBLE_DOMAIN}"
COPY app.js /usr/share/nginx/html/app.js
COPY favicons/favicon.svg favicons/favicon.ico favicons/favicon-16.png favicons/favicon-32.png favicons/favicon-48.png favicons/favicon-180.png favicons/favicon-192.png favicons/favicon-512.png /usr/share/nginx/html/
