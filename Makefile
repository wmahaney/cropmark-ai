# cropmark, web version: one Makefile.
#
#   make web          the site, into build/web/ (needs Emscripten: emcc)
#   make test         the core's unit and golden-image tests, compiled to WebAssembly
#                     and run under Node
#   make browser-test the built site in headless Chrome (needs Node and Chrome)
#   make serve        build the site and serve it at http://localhost:8000
#   make clean
#
# The editor and the core come from the submodule core/ (the desktop repository).
# Get it with:  git submodule update --init

EMCC  ?= emcc
NODE  ?= node
B     := build
CORE  := core
PORT  ?= 8000

# Where the page's two footer links point: "Source" (REPO_URL) and the author's name
# (AUTHOR_URL). Neither address is written into the source: the workflow passes them,
# and a local build has neither link.
REPO_URL ?=
AUTHOR_URL ?=

# The web limit on image size: 32 megapixels (the desktop limit is 128).
MAX_PIXELS := '(32u * 1024u * 1024u)'

CORE_SRC := $(CORE)/src/pm_image.c $(CORE)/src/pm_file.c $(CORE)/src/pm_exif.c $(CORE)/src/pm_icc.c \
            $(CORE)/src/pm_draw.c $(CORE)/src/pm_text.c $(CORE)/src/pm_doc.c $(CORE)/src/pm_session.c
STB_SRC  := $(CORE)/src/pm_stb.c
CORE_HDR := $(CORE)/include/pmark.h $(CORE)/src/pm_internal.h
EMBASE   := -O2 -std=c11 -I$(CORE)/include -I$(CORE)/third_party -DPM_MAX_PIXELS=$(MAX_PIXELS)
PAGE     := web/index.html web/style.css web/app.js web/theme.js

all: web

$(CORE)/include/pmark.h:
	@echo "core/ is empty. Run: git submodule update --init"; exit 1

# ---- the site ------------------------------------------------------------------
# Single-threaded WebAssembly (GitHub Pages cannot send the headers threads need), no
# eval, memory that grows up to 2 GB so a large photo is an error message and not a
# dead tab.
EXPORTS := _cm_web_open,_cm_web_wake,_cm_web_strerror,_cm_web_modified,_cm_web_set_palette,_cm_web_set_format,_cm_web_view,_cm_web_copy,_cm_web_status,_cm_web_history,_malloc,_free

web: $(B)/web/cropmark.js $(PAGE:web/%=$(B)/web/%) $(B)/web/font/DejaVuSans.ttf $(B)/web/THIRD_PARTY.txt $(B)/web/config.js

$(B)/web $(B)/obj $(B)/test:
	mkdir -p $@ $(B)/web/font

# The core objects are shared by the site and the tests.
$(B)/obj/stb.o: $(STB_SRC) $(CORE_HDR) | $(B)/obj
	$(EMCC) $(EMBASE) -w -c $< -o $@
$(B)/obj/%.o: $(CORE)/src/%.c $(CORE_HDR) | $(B)/obj
	$(EMCC) $(EMBASE) -Wall -Wextra -c $< -o $@
CORE_OBJ := $(CORE_SRC:$(CORE)/src/%.c=$(B)/obj/%.o) $(B)/obj/stb.o

# gnu11, not c11, for the editor only: its calls into the page (EM_ASM) need it.
$(B)/web/cropmark.js: $(CORE_OBJ) $(CORE)/gui/gui.c web/picker_stub.c $(CORE)/gui/picker.h $(CORE)/cli/cropmark.h | $(B)/web
	$(EMCC) $(EMBASE) -std=gnu11 -Wall -Wextra -I$(CORE)/cli -I$(CORE)/gui -sUSE_SDL=2 \
	  $(CORE)/gui/gui.c web/picker_stub.c $(CORE_OBJ) \
	  --no-entry -sMODULARIZE=1 -sEXPORT_NAME=createCropmark -sENVIRONMENT=web \
	  -sDYNAMIC_EXECUTION=0 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=2147483648 \
	  -sEXPORTED_FUNCTIONS=$(EXPORTS) -sEXPORTED_RUNTIME_METHODS=FS,ENV,ccall,UTF8ToString \
	  -o $@

$(B)/web/%: web/% | $(B)/web
	cp $< $@

$(B)/web/font/DejaVuSans.ttf: third_party/dejavu/DejaVuSans.ttf | $(B)/web
	cp $< $@

# The addresses go into a JavaScript string, so refuse the characters that could end it.
CHECK_ADDR = $(if $(findstring ",$(1))$(findstring \,$(1))$(findstring <,$(1)),$(error $(2) must not contain ", \ or <))
$(B)/web/config.js: Makefile FORCE | $(B)/web
	$(call CHECK_ADDR,$(REPO_URL),REPO_URL)
	$(call CHECK_ADDR,$(AUTHOR_URL),AUTHOR_URL)
	@printf '// Written by the build. Addresses for the footer links, or "" for none.\nwindow.CROPMARK_SOURCE = "%s";\nwindow.CROPMARK_AUTHOR = "%s";\n' "$(REPO_URL)" "$(AUTHOR_URL)" > $@.tmp
	@cmp -s $@.tmp $@ || mv $@.tmp $@; rm -f $@.tmp

$(B)/web/THIRD_PARTY.txt: third_party/NOTICE.txt third_party/dejavu/LICENSE.txt | $(B)/web
	cat third_party/NOTICE.txt > $@
	printf '\n\n===== DejaVu Sans =====\n\n' >> $@
	cat third_party/dejavu/LICENSE.txt >> $@

# ---- tests: the core, as WebAssembly, under Node --------------------------------
# NODERAWFS lets the test programs read and write real files, so the core's own tests
# and golden images run unchanged against the WebAssembly build.
# WASM_ASYNC_COMPILATION=0: the module is read from disk and compiled at once, which
# is what a command-line program wants (and does not depend on fetch under Node).
EMTEST := $(EMBASE) -sNODERAWFS=1 -sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=1 -sWASM_ASYNC_COMPILATION=0
# Extra sources or flags for the test programs. Empty unless your Emscripten needs
# help (docs/ARCHITECTURE.md, "Building with a distribution's Emscripten").
EMTEST_EXTRA ?=

# Emscripten starts a program with a umask of 0777, so every file the core writes
# would get mode 000, and only root could read it back. This gives the test programs
# the umask of the Node process instead (tests/node_umask.c). gnu11 for its EM_ASM.
$(B)/obj/node_umask.o: tests/node_umask.c | $(B)/obj
	$(EMCC) -O2 -std=gnu11 -Wall -Wextra -c $< -o $@
TEST_OBJ := $(CORE_OBJ) $(B)/obj/node_umask.o

$(B)/test/test_core.js: $(CORE)/tests/test_core.c $(TEST_OBJ) | $(B)/test
	$(EMCC) $(EMTEST) -I$(CORE)/src $< $(TEST_OBJ) -o $@
$(B)/test/imgdiff.js: $(CORE)/tests/imgdiff.c $(TEST_OBJ) | $(B)/test
	$(EMCC) $(EMTEST) $< $(TEST_OBJ) $(EMTEST_EXTRA) -o $@
$(B)/test/cropmark.js: $(CORE)/cli/main.c $(CORE)/cli/batch.c $(TEST_OBJ) | $(B)/test
	$(EMCC) $(EMTEST) -DCM_NO_GUI -I$(CORE)/cli $(CORE)/cli/main.c $(CORE)/cli/batch.c $(TEST_OBJ) $(EMTEST_EXTRA) -o $@

# Small shell wrappers, so the core's test scripts can run the programs by path.
$(B)/test/bin/%: $(B)/test/%.js
	mkdir -p $(B)/test/bin
	printf '#!/bin/sh\nexec $(NODE) "%s" "$$@"\n' "$(abspath $<)" > $@
	chmod +x $@

test: $(B)/test/test_core.js $(B)/test/bin/cropmark $(B)/test/bin/imgdiff
	cd $(CORE) && PMARK_FONT="$(abspath third_party/dejavu/DejaVuSans.ttf)" $(NODE) "$(abspath $(B)/test/test_core.js)"
	cd $(CORE) && PMARK_FONT="$(abspath third_party/dejavu/DejaVuSans.ttf)" sh tests/cli_smoke.sh "$(abspath $(B)/test/bin/cropmark)"
	cd $(CORE) && PMARK_FONT="$(abspath third_party/dejavu/DejaVuSans.ttf)" sh tests/golden.sh "$(abspath $(B)/test/bin/cropmark)" "$(abspath $(B)/test/bin/imgdiff)"

browser-test: web $(B)/test/bin/cropmark $(B)/test/bin/imgdiff
	$(NODE) tests/browser/check.mjs $(B)/web

serve: web
	@echo "cropmark at http://localhost:$(PORT)  (Ctrl+C to stop)"
	python3 -m http.server $(PORT) --bind 127.0.0.1 --directory $(B)/web

clean:
	rm -rf $(B)

FORCE:
.PHONY: all web test browser-test serve clean FORCE
