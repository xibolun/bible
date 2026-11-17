ifeq ($(OS),Windows_NT)
PYTHON ?= python
else
PYTHON ?= python3
endif
VERSION ?= v0.1.0
GOOS ?= $(shell go env GOOS)
GOARCH ?= $(shell go env GOARCH)
REF ?= issue/1
.PHONY: help doctor check build package dist dev clean bindings verify-data verify-branding release-artifacts smoke
help doctor check build package dist dev clean bindings verify-data verify-branding smoke:
	$(PYTHON) tools/project.py $@ --os $(GOOS) --arch $(GOARCH) --version $(VERSION)
release-artifacts:
	$(PYTHON) tools/project.py release-artifacts --ref "$(REF)" --version $(VERSION)
