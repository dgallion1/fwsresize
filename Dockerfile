FROM nginx:1.27-alpine

ARG VERSION=dev

COPY default.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
RUN sed -i "s|DEPLOY_VERSION|${VERSION}|g" /usr/share/nginx/html/index.html
COPY app.js /usr/share/nginx/html/app.js
COPY help.html /usr/share/nginx/html/help.html
COPY favicons/favicon.svg favicons/favicon.ico favicons/favicon-16.png favicons/favicon-32.png favicons/favicon-48.png favicons/favicon-180.png favicons/favicon-192.png favicons/favicon-512.png /usr/share/nginx/html/
