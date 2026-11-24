ifeq ($(OS),Windows_NT)
PYTHON ?= python
else
PYTHON ?= python3
endif
VERSION ?= v0.3.1
REF ?= main
TARGET_ARGS = $(if $(GOOS),--os $(GOOS)) $(if $(GOARCH),--arch $(GOARCH))
.PHONY: help doctor check build package dist dev clean bindings verify-data verify-branding release-artifacts smoke
help doctor check build package dist dev clean bindings verify-data verify-branding smoke:
	$(PYTHON) tools/project.py $@ $(TARGET_ARGS) --version $(VERSION)
release-artifacts:
	$(PYTHON) tools/project.py release-artifacts --ref "$(REF)" --version $(VERSION)
