# Price Fixer - every project task has a target here. Run `make help` to list
# them. The targets wrap the npm scripts in package.json; use the targets.

NPM ?= npm

.DEFAULT_GOAL := help

.PHONY: help install dev dev-firefox dev-test dev-test-firefox firefox \
        build build-firefox build-all package \
        test test-watch bench type-check lint lint-fix lint-css css-unused lint-addon format format-check fix \
        outdated validate check version clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies (npm ci: exact lockfile versions)
	$(NPM) ci

# --- Development -----------------------------------------------------------

dev: ## Webpack watch mode (Chrome) -> dist/
	$(NPM) run dev

dev-firefox: ## Webpack watch mode (Firefox) -> dist-firefox/
	$(NPM) run dev:firefox

dev-test: ## Build Chrome + serve the test page at localhost:3456
	$(NPM) run dev:test

dev-test-firefox: ## Build Firefox + serve the test page at localhost:3456
	$(NPM) run dev:test:firefox

firefox: build-firefox ## Build Firefox, then open Firefox with the extension on the test page
	$(NPM) run firefox

# --- Build -----------------------------------------------------------------

build: ## Production build (Chrome) -> dist/
	$(NPM) run build

build-firefox: ## Production build (Firefox) -> dist-firefox/
	$(NPM) run build:firefox

build-all: ## Build both Chrome + Firefox
	$(NPM) run build:all

package: ## Build both targets and zip them (price-fixer-{chrome,firefox}.zip)
	$(NPM) run package

# --- Quality ---------------------------------------------------------------

test: ## Run Jest unit tests
	$(NPM) test

test-watch: ## Run Jest in watch mode
	$(NPM) run test:watch

bench: ## Scan / mutation / rescan timings on a 3,000-card synthetic page
	$(NPM) run bench

type-check: ## TypeScript check (tsc --noEmit)
	$(NPM) run type-check

lint: ## ESLint, fails on any warning
	$(NPM) run lint

lint-fix: ## Auto-fix ESLint issues (braces, blank lines, ...)
	$(NPM) run lint:fix

lint-css: ## Stylelint on ui.css and the <style> blocks of popup.html / options.html
	$(NPM) run lint:css

css-unused: ## Report CSS selectors and variables no extension page uses
	$(NPM) run css:unused

lint-addon: build-firefox ## Mozilla's add-on linter on the Firefox build (as AMO runs it)
	$(NPM) run lint:addon

format: ## Format everything: ESLint --fix, Stylelint --fix, then Prettier
	$(NPM) run format

format-check: ## Check formatting without writing
	$(NPM) run format:check

fix: format ## Alias for format

validate: ## CI check: type-check + lint + CSS lint + unused CSS + format-check + test
	$(NPM) run validate

check: validate lint-addon build ## Everything before a commit: validate + add-on lint + both builds

# --- Dependencies ----------------------------------------------------------

outdated: ## List newer package versions: safe (same major) vs major updates
	$(NPM) run deps:outdated

# --- Release ---------------------------------------------------------------

version: ## Set the version everywhere: make version V=1.5.0
	@test -n "$(V)" || (echo "Usage: make version V=1.5.0" && exit 1)
	node scripts/bump-version.js $(V)

# --- Housekeeping ----------------------------------------------------------

clean: ## Remove build output and packaged zips
	rm -rf dist dist-firefox price-fixer-chrome.zip price-fixer-firefox.zip
