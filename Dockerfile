FROM nginx:1.27-alpine

ARG VERSION=dev
ARG CF_ANALYTICS_TOKEN=""

COPY default.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY help.html /usr/share/nginx/html/help.html
RUN sed -i "s|DEPLOY_VERSION|${VERSION}|g" /usr/share/nginx/html/index.html
RUN if [ -n "${CF_ANALYTICS_TOKEN}" ]; then \
      sed -i "s|CF_ANALYTICS_TOKEN|${CF_ANALYTICS_TOKEN}|g" \
        /usr/share/nginx/html/index.html /usr/share/nginx/html/help.html; \
    else \
      sed -i '/<!-- BEGIN CF_ANALYTICS -->/,/<!-- END CF_ANALYTICS -->/d' \
        /usr/share/nginx/html/index.html /usr/share/nginx/html/help.html; \
    fi
COPY app.js /usr/share/nginx/html/app.js
COPY favicons/favicon.svg favicons/favicon.ico favicons/favicon-16.png favicons/favicon-32.png favicons/favicon-48.png favicons/favicon-180.png favicons/favicon-192.png favicons/favicon-512.png /usr/share/nginx/html/
