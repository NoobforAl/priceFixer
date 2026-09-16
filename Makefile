# Price Fixer - convenience wrappers around the npm scripts in package.json.
# Run `make help` to list targets.

NPM ?= npm

.DEFAULT_GOAL := help

.PHONY: help install dev dev-firefox dev-test dev-test-firefox \
        build build-firefox build-all package \
        test test-watch type-check lint format format-check fix validate clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	$(NPM) install

# --- Development -----------------------------------------------------------

dev: ## Webpack watch mode (Chrome)
	$(NPM) run dev

dev-firefox: ## Webpack watch mode (Firefox)
	$(NPM) run dev:firefox

dev-test: ## Build Chrome + serve test page at localhost:3456
	$(NPM) run dev:test

dev-test-firefox: ## Build Firefox + serve test page at localhost:3456
	$(NPM) run dev:test:firefox

# --- Build -----------------------------------------------------------------

build: ## Production build (Chrome) -> dist/
	$(NPM) run build

build-firefox: ## Production build (Firefox) -> dist-firefox/
	$(NPM) run build:firefox

build-all: ## Build both Chrome + Firefox
	$(NPM) run build:all

package: ## Build both targets and zip them
	$(NPM) run package

# --- Quality ---------------------------------------------------------------

test: ## Run Jest tests
	$(NPM) test

test-watch: ## Run Jest in watch mode
	$(NPM) run test:watch

type-check: ## tsc --noEmit
	$(NPM) run type-check

lint: ## Run ESLint
	$(NPM) run lint

format: ## Format code with Prettier
	$(NPM) run format

format-check: ## Check formatting without writing
	$(NPM) run format:check

fix: ## Auto-fix lint issues and format code
	$(NPM) run lint:fix
	$(NPM) run format

validate: ## Full CI check: type-check + lint + format-check + test
	$(NPM) run validate

# --- Housekeeping ----------------------------------------------------------

clean: ## Remove build output and packaged zips
	rm -rf dist dist-firefox price-fixer-chrome.zip price-fixer-firefox.zip
