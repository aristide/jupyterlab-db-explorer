FROM debian:bookworm-slim AS jupyter

LABEL author=aristide

SHELL [ "/bin/bash", "-c" ]
ENV SHELL=/bin/bash
# Replace shell with bash so we can source files
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# Set debconf to run non-interactively
RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y \
    # For frappe framework
    git \
    mariadb-client \
    postgresql-client \
    gettext-base \
    wget \
    # for PDF
    libssl-dev \
    fonts-cantarell \
    xfonts-75dpi \
    xfonts-base \
    # weasyprint dependencies
    libpango-1.0-0 \
    libharfbuzz0b \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    # to work inside the container
    locales \
    build-essential \
    cron \
    curl \
    vim \
    sudo \
    iputils-ping \
    watch \
    tree \
    nano \
    less \
    software-properties-common \
    bash-completion \
    # For psycopg2
    libpq-dev \
    # Other
    libffi-dev \
    liblcms2-dev \
    libldap2-dev \
    libmariadb-dev \
    libsasl2-dev \
    libtiff5-dev \
    libwebp-dev \
    redis-tools \
    rlwrap \
    tk8.6-dev \
    ssh-client \
    # VSCode container requirements
    net-tools \
    # For pyenv build dependencies
    # https://github.com/frappe/frappe_docker/issues/840#issuecomment-1185206895
    make \
    # For pandas
    libbz2-dev \
    # For bench execute
    libsqlite3-dev \
    # For other dependencies
    zlib1g-dev \
    libreadline-dev \
    llvm \
    libncurses5-dev \
    libncursesw5-dev \
    xz-utils \
    tk-dev \
    liblzma-dev \
    file \
    && rm -rf /var/lib/apt/lists/*

# Create new user with home directory, improve docker compatibility with UID/GID 1000,
# add user to sudo group, allow passwordless sudo, switch to that user
# and change directory to user home directory
RUN groupadd -g 1000 jupyter \
    && useradd --no-log-init -r -m -u 1000 -g 1000 -G sudo jupyter \
    && echo "jupyter ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers

USER jupyter
WORKDIR /home/jupyter

# Install Python via pyenv
ENV PYENV_ROOT=/home/jupyter/.pyenv
ENV PATH=$PYENV_ROOT/shims:$PYENV_ROOT/bin:$PATH
ENV PYTHON_VERSION=3.12.7

# From https://github.com/pyenv/pyenv#basic-github-checkout
RUN git clone --depth 1 https://github.com/pyenv/pyenv.git .pyenv \
    && pyenv install $PYTHON_VERSION \
    && PYENV_VERSION=$PYTHON_VERSION pip install --no-cache-dir virtualenv \
    && pyenv global $PYTHON_VERSION \
    && sed -Ei -e '/^([^#]|$)/ {a export PYENV_ROOT="/home/jupyter/.pyenv" a export PATH="$PYENV_ROOT/bin:$PATH" a ' -e ':a' -e '$!{n;ba};}' ~/.profile \
    && echo 'eval "$(pyenv init --path)"' >>~/.profile \
    && echo 'eval "$(pyenv init -)"' >>~/.bashrc

# Clone and install bench in the local user home directory
# For development, bench source is located in ~/.bench
ENV PATH=/home/jupyter/.local/bin:$PATH

# Install Node via nvm
ENV NODE_VERSION=18.20.4
ENV NVM_DIR=/home/jupyter/.nvm
ENV PATH=${NVM_DIR}/versions/node/v${NODE_VERSION}/bin/:${PATH}

RUN wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash \
    && . ${NVM_DIR}/nvm.sh \
    && npm install -g yarn \
    && nvm install ${NODE_VERSION} \
    && nvm use v${NODE_VERSION} \
    && npm install -g yarn \
    && nvm alias default v${NODE_VERSION} \
    && rm -rf ${NVM_DIR}/.cache \
    && echo 'export NVM_DIR="/home/jupyter/.nvm"' >>~/.bashrc \
    && echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm' >> ~/.bashrc \
    && echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion' >> ~/.bashrc

# Install mc client
RUN mkdir -p /home/jupyter/.local/bin \
    && curl https://dl.min.io/client/mc/release/linux-amd64/mc -o /home/jupyter/.local/bin/mc \
    && chmod +x /home/jupyter/.local/bin/mc

# Install JupyterLab 4 and hatch build tools
RUN pip install --no-cache-dir \
    "jupyterlab>=4.0.0,<5" \
    "hatchling>=1.5.0" \
    "hatch-jupyter-builder>=0.5" \
    "hatch-nodejs-version>=0.3.2"

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

EXPOSE 8888 9999

ENV PATH=/home/jupyter/.pyenv/versions/$PYTHON_VERSION/bin:$PATH

FROM jupyter AS jupyter-test

# Print version and verify bashrc is properly sourced so that everything works
# in the interactive shell and Dockerfile

RUN node --version \
    && npm --version \
    && yarn --version \
    && python --version \
    && jupyter lab --version \
    && claude --version

RUN bash -c "node --version" \
    && bash -c "npm --version" \
    && bash -c "yarn --version"