#!/bin/bash
sed -i 's=$GA_CODE='"$GA_CODE"'=g' /usr/share/nginx/html/index.html
sed -i 's=$AMCUI_API='"$AMCUI_API"'=g' /usr/share/nginx/html/index.html
sed -i 's=$SENTRY_DSN='"$SENTRY_DSN"'=g' /usr/share/nginx/html/index.html
