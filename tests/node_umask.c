/* Linked into the test programs only (Makefile, "tests"). Not part of the site.
 *
 * Emscripten's C library starts every program with a umask of 0777: it is a stub,
 * not the umask of the process. The core writes a file with mode 0666 & ~umask, as on
 * the desktop, so under Emscripten every file it writes gets mode 000. With NODERAWFS
 * that is a real file with no permissions, which root can read back and nobody else
 * can; the core's tests then fail on the first load of a file they have just saved.
 *
 * A command-line program has the umask of its process, so give the test programs
 * that: Node knows it. The page does not go through here; it reads the saved file
 * from the in-memory file system after an explicit chmod (web/app.js). */
#include <emscripten.h>
#include <sys/stat.h>

__attribute__((constructor)) static void use_the_process_umask(void)
{
    umask((mode_t)EM_ASM_INT({ return process.umask(); }));
}
