.PHONY: build test run clean

build: node_modules

node_modules: package.json
	npm install

test: build
	npx jest --coverage

run: build
	wslview index.html

clean:
	rm -rf node_modules coverage
