FROM node:24-trixie
LABEL org.opencontainers.image.source=https://github.com/bfritscher/amcui-grademanager
RUN apt-get update && apt-get install -y \
    auto-multiple-choice \
    graphicsmagick \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*
RUN policy_file=$(find /etc -path '*ImageMagick*/policy.xml' 2>/dev/null | head -n1); \
    if [ -n "$policy_file" ] && grep -q 'disable ghostscript format types' "$policy_file"; then \
        sed -i '/disable ghostscript format types/,+6d' "$policy_file"; \
    fi
RUN git config --global user.email "root@amcui.ig.he-arc.ch"
RUN git config --global user.name "GradeManager (AMCUI)"
RUN mkdir -p /amc
WORKDIR /amc

COPY package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/exam-core/package.json packages/exam-core/package.json
RUN npm install --workspace=amcui-server --workspace=@amcui/exam-core --include-workspace-root --legacy-peer-deps

ARG COMMIT_SHA=""
ENV COMMIT_SHA=${COMMIT_SHA}
COPY packages/exam-core packages/exam-core
COPY apps/server apps/server
ENV AMCUI_PROJECTS_DIR=/amc/projects
ENV AMCUI_TEMPLATES_DIR=/amc/templates
RUN npm run build:core && npm run build --workspace=amcui-server

VOLUME ["/amc/projects"]
VOLUME ["/amc/templates"]

# Define default command.
CMD ["npm", "run", "start", "--workspace=amcui-server"]
