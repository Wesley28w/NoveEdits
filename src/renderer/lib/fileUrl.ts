/** Converts an absolute filesystem path (Windows or POSIX) into a `file://` URL usable in <video>/<img> src. */
export function toFileUrl(filePath: string): string {
  let p = filePath.replace(/\\/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  return 'file://' + encodeURI(p);
}
