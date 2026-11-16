/* The picture picker, absent.
 *
 * The desktop picker (core/gui/picker.c) lists folders with POSIX calls and decodes
 * thumbnails on a worker thread. Neither exists in a browser tab, so the web build
 * links this file in its place. The editor never shows a picker here: Open asks the
 * page for a file instead (see the "web" section of core/gui/gui.c). These functions
 * exist only so that the editor's source compiles unchanged.
 */
#include "picker.h"

picker     *picker_new(SDL_Renderer *ren, const pm_font *font, const char *dir) { (void)ren; (void)font; (void)dir; return NULL; }
void        picker_free(picker *p) { (void)p; }
pick_result picker_event(picker *p, const SDL_Event *e) { (void)p; (void)e; return PICK_NONE; }
void        picker_render(picker *p, float dpi) { (void)p; (void)dpi; }
const char *picker_choice(const picker *p) { (void)p; return ""; }
const char *picker_dir(const picker *p) { (void)p; return ""; }
void        picker_set_status(picker *p, const char *fmt, ...) { (void)p; (void)fmt; }
bool        picker_is_dir(const char *path) { (void)path; return false; }
bool        picker_pictures_dir(char *out, size_t cap) { (void)out; (void)cap; return false; }
size_t      picker_shown(const picker *p) { (void)p; return 0; }
const char *picker_selected(const picker *p) { (void)p; return NULL; }
size_t      picker_thumbs_done(const picker *p) { (void)p; return 0; }
