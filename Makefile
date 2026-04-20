.PHONY: build test run clean docker-deploy

DEPLOY_HOST ?= spark
DEPLOY_PORT ?= 3002
SSH ?= tailscale ssh
VERSION := $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)-$(shell date +%s)

build: node_modules

node_modules: package.json
	npm install

test: build
	npx jest --coverage

run: build
	wslview index.html

clean:
	rm -rf node_modules coverage

docker-deploy:
	rsync -az --delete -e '$(SSH)' \
		--exclude='node_modules' \
		--exclude='coverage' \
		--exclude='.git' \
		--exclude='.codex' \
		./ $(DEPLOY_HOST):~/work/mom/
	$(SSH) $(DEPLOY_HOST) "VERSION=$(VERSION) DOCKER_BUILDKIT=1 docker compose -f ~/work/mom/docker-compose.yml build && PORT=$(DEPLOY_PORT) docker compose -f ~/work/mom/docker-compose.yml up -d"
