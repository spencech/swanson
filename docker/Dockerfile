# Swanson Docker Image: OpenClaw + TeachUpbeat repos + ChunkHound indexes
# Multi-stage build: clone repos → index → runtime

# ── Stage 1: Clone all TeachUpbeat repos ────────────────────────────────────────
FROM node:22-bookworm AS repos

ARG GITHUB_PAT
RUN test -n "$GITHUB_PAT" || (echo "GITHUB_PAT build arg required" && exit 1)

RUN mkdir -p /repos

# Clone all 11 repos (develop branch preferred, fallback to default)
COPY scripts/clone-repos.sh /tmp/clone-repos.sh
RUN chmod +x /tmp/clone-repos.sh && GITHUB_PAT=$GITHUB_PAT /tmp/clone-repos.sh /repos

# ── Stage 2: Index repos with ChunkHound ────────────────────────────────────────
FROM repos AS indexed

ARG OPENAI_API_KEY
RUN test -n "$OPENAI_API_KEY" || (echo "OPENAI_API_KEY build arg required for embeddings" && exit 1)

RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    /root/.local/bin/uv tool install chunkhound
ENV PATH="/root/.local/bin:/root/.local/share/uv/tools/chunkhound/bin:$PATH"

COPY scripts/index-repos.sh /tmp/index-repos.sh
RUN chmod +x /tmp/index-repos.sh && OPENAI_API_KEY=$OPENAI_API_KEY /tmp/index-repos.sh /repos

# ── Stage 3: Runtime ────────────────────────────────────────────────────────────
FROM node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y git jq python3 python3-venv && rm -rf /var/lib/apt/lists/*

# Install OpenClaw via npm
RUN npm install -g openclaw@latest

# Install ChunkHound via uv (Python package)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    /root/.local/bin/uv tool install chunkhound
ENV PATH="/root/.local/bin:/root/.local/share/uv/tools/chunkhound/bin:$PATH"

# Create workspace directory structure
RUN mkdir -p /workspace/threads /workspace/plans /workspace/sessions /workspace/repos /workspace/knowledge

# Copy cloned + indexed repos from build stages
COPY --from=indexed /repos /workspace/repos

# Copy per-repo AGENTS.md files (if they exist)
COPY openclaw-config/repo-agents/ /tmp/repo-agents/
RUN for f in /tmp/repo-agents/*.md; do \
      repo_name=$(basename "$f" .md); \
      if [ -d "/workspace/repos/${repo_name}" ]; then \
        cp "$f" "/workspace/repos/${repo_name}/AGENTS.md"; \
      fi; \
    done && rm -rf /tmp/repo-agents

# Make repos read-only (agent should never modify source code)
RUN chmod -R a-w /workspace/repos

# Copy OpenClaw workspace configuration
COPY openclaw-config/AGENTS.md /workspace/AGENTS.md
COPY openclaw-config/SOUL.md /workspace/SOUL.md
COPY openclaw-config/TOOLS.md /workspace/TOOLS.md

# Copy custom plugin
COPY plugins/swanson-tools/ /workspace/extensions/swanson-tools/

# Copy repo catalog for agent context
COPY openclaw-config/repos.md /workspace/repos.md

# Copy ChunkHound multi-repo config
COPY chunkhound-config.json /workspace/chunkhound-config.json

# Copy repo refresh script (git pull + re-index)
COPY scripts/refresh-repos.sh /usr/local/bin/refresh-repos
RUN chmod +x /usr/local/bin/refresh-repos

# Initialize persistence files
RUN echo '{"threads":[]}' > /workspace/threads/index.json && \
    echo '{"plans":[]}' > /workspace/plans/index.json

# Copy entrypoint
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# OpenClaw gateway port
EXPOSE 18789

# Volumes for persistent data
VOLUME ["/workspace/threads", "/workspace/plans", "/workspace/sessions", "/workspace/knowledge"]

ENTRYPOINT ["/entrypoint.sh"]
